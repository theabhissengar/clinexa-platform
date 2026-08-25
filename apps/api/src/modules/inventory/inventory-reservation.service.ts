import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  ProductType,
  ReservationStatus,
  StockMovementType,
} from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { ReserveStockDto } from './dto/inventory.dto';
import { InventoryLedgerService } from './inventory-ledger.service';
import { InventoryPolicyService } from './warehouse.service';
import { WarehouseService } from './warehouse.service';

type Tx = Prisma.TransactionClient;
type DbClient = Tx | PrismaService;

export type ReserveForOrderLine = {
  productVariantId: string;
  quantity: number;
  warehouseId?: string | null;
};

@Injectable()
export class InventoryReservationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: InventoryLedgerService,
    private readonly warehouses: WarehouseService,
    private readonly policies: InventoryPolicyService,
  ) {}

  /**
   * HTTP / explicit Reserve (API-198). Rejects untracked lines.
   * When `tx` is provided, joins the caller's transaction (no nested $transaction).
   */
  async reserve(
    dto: ReserveStockDto,
    actorUserId?: string,
    tx?: Tx,
  ) {
    for (const line of dto.lines) {
      const variant = await this.prisma.productVariant.findFirst({
        where: { id: line.productVariantId, deletedAt: null },
        include: { product: true },
      });
      if (!variant) {
        throw new BadRequestException({
          code: ErrorCodes.RES_NOT_FOUND,
          message: `Variant not found: ${line.productVariantId}`,
        });
      }
      if (
        !variant.isFulfillable ||
        variant.product.productType === ProductType.DIGITAL
      ) {
        throw new BadRequestException({
          code: ErrorCodes.INV_NOT_TRACKED,
          message: `Inventory not tracked for variant ${line.productVariantId}`,
        });
      }
    }

    const run = async (client: DbClient) =>
      this.reserveTrackedLines(
        {
          orderId: dto.orderId ?? null,
          lines: dto.lines,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
          actorUserId,
        },
        client,
      );

    if (tx) {
      return run(tx);
    }
    return this.prisma.$transaction((inner) => run(inner));
  }

  /**
   * Orders orchestrator path: skip digital / non-fulfillable lines (no-op if none remain).
   * Idempotent on existing reservation for `orderId`.
   */
  async reserveForOrder(
    orderId: string,
    lines: ReserveForOrderLine[],
    actorUserId: string | undefined,
    tx: Tx,
  ) {
    const tracked: ReserveForOrderLine[] = [];
    for (const line of lines) {
      const variant = await this.prisma.productVariant.findFirst({
        where: { id: line.productVariantId, deletedAt: null },
        include: { product: true },
      });
      if (!variant) {
        throw new BadRequestException({
          code: ErrorCodes.RES_NOT_FOUND,
          message: `Variant not found: ${line.productVariantId}`,
        });
      }
      if (
        !variant.isFulfillable ||
        variant.product.productType === ProductType.DIGITAL
      ) {
        continue;
      }
      tracked.push(line);
    }

    if (tracked.length === 0) {
      return null;
    }

    const existing = await tx.stockReservation.findUnique({
      where: { orderId },
      include: { lines: true },
    });
    if (existing) {
      if (existing.status === ReservationStatus.PENDING) {
        return existing;
      }
      // Already terminal — do not create another (unique orderId).
      return existing;
    }

    return this.reserveTrackedLines(
      {
        orderId,
        lines: tracked,
        actorUserId,
      },
      tx,
    );
  }

  async release(id: string, actorUserId?: string, tx?: Tx) {
    return this.transition(id, ReservationStatus.RELEASED, actorUserId, tx);
  }

  async commit(id: string, actorUserId?: string, tx?: Tx) {
    return this.transition(id, ReservationStatus.COMMITTED, actorUserId, tx);
  }

  async findByOrderId(orderId: string, tx?: Tx) {
    const client: DbClient = tx ?? this.prisma;
    return client.stockReservation.findUnique({
      where: { orderId },
      include: { lines: true },
    });
  }

  async expirePending(now = new Date()) {
    const expired = await this.prisma.stockReservation.findMany({
      where: {
        status: ReservationStatus.PENDING,
        expiresAt: { lte: now },
      },
      include: { lines: true },
      take: 50,
    });
    const results = [];
    for (const reservation of expired) {
      results.push(
        await this.transition(
          reservation.id,
          ReservationStatus.EXPIRED,
          undefined,
        ),
      );
    }
    return { expired: results.length, reservations: results };
  }

  private async reserveTrackedLines(
    input: {
      orderId: string | null;
      lines: ReserveForOrderLine[];
      expiresAt?: Date;
      actorUserId?: string;
    },
    client: DbClient,
  ) {
    const policy = await this.policies.getOrCreateDefault();
    const expiresAt =
      input.expiresAt ??
      new Date(Date.now() + policy.reservationTimeoutMinutes * 60 * 1000);

    const reservation = await client.stockReservation.create({
      data: {
        orderId: input.orderId,
        status: ReservationStatus.PENDING,
        expiresAt,
      },
    });

    for (const line of input.lines) {
      const warehouseId = await this.warehouses.resolveWarehouseId(
        line.warehouseId,
      );
      await client.stockReservationLine.create({
        data: {
          reservationId: reservation.id,
          warehouseId,
          productVariantId: line.productVariantId,
          quantity: line.quantity,
        },
      });
      await this.ledger.appendAndProject(
        {
          warehouseId,
          productVariantId: line.productVariantId,
          movementType: StockMovementType.RESERVE,
          quantity: line.quantity,
          orderId: input.orderId,
          reservationId: reservation.id,
          actorUserId: input.actorUserId,
          reason: 'Reserve',
        },
        client,
      );
    }

    return client.stockReservation.findUniqueOrThrow({
      where: { id: reservation.id },
      include: { lines: true },
    });
  }

  private async transition(
    id: string,
    to: ReservationStatus,
    actorUserId?: string,
    tx?: Tx,
  ) {
    const run = async (client: DbClient) => {
      // Lock reservation header before status math.
      await client.$queryRaw`
        SELECT id FROM stock_reservations
        WHERE id = ${id}::uuid
        FOR UPDATE
      `;

      const reservation = await client.stockReservation.findUnique({
        where: { id },
        include: { lines: true },
      });
      if (!reservation) {
        throw new NotFoundException({
          code: ErrorCodes.RES_NOT_FOUND,
          message: 'Reservation not found',
        });
      }

      // Idempotent: already at target terminal.
      if (reservation.status === to) {
        return reservation;
      }

      // Release treats EXPIRED as already released.
      if (
        to === ReservationStatus.RELEASED &&
        reservation.status === ReservationStatus.EXPIRED
      ) {
        return reservation;
      }

      if (reservation.status !== ReservationStatus.PENDING) {
        throw new BadRequestException({
          code: ErrorCodes.INV_RESERVATION_INVALID,
          message: `Reservation is ${reservation.status}, expected PENDING`,
        });
      }

      const movementType =
        to === ReservationStatus.COMMITTED
          ? StockMovementType.COMMIT
          : StockMovementType.RELEASE;

      for (const line of reservation.lines) {
        await this.ledger.appendAndProject(
          {
            warehouseId: line.warehouseId,
            productVariantId: line.productVariantId,
            movementType,
            quantity: line.quantity,
            orderId: reservation.orderId,
            reservationId: reservation.id,
            actorUserId,
            reason: to,
          },
          client,
        );
      }

      return client.stockReservation.update({
        where: { id },
        data: { status: to },
        include: { lines: true },
      });
    };

    if (tx) {
      return run(tx);
    }
    return this.prisma.$transaction((inner) => run(inner));
  }
}
