import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
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

@Injectable()
export class InventoryReservationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: InventoryLedgerService,
    private readonly warehouses: WarehouseService,
    private readonly policies: InventoryPolicyService,
  ) {}

  async reserve(dto: ReserveStockDto, actorUserId?: string) {
    const policy = await this.policies.getOrCreateDefault();
    const expiresAt = dto.expiresAt
      ? new Date(dto.expiresAt)
      : new Date(Date.now() + policy.reservationTimeoutMinutes * 60 * 1000);

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

    return this.prisma.$transaction(async (tx) => {
      const reservation = await tx.stockReservation.create({
        data: {
          orderId: dto.orderId ?? null,
          status: ReservationStatus.PENDING,
          expiresAt,
        },
      });

      for (const line of dto.lines) {
        const warehouseId = await this.warehouses.resolveWarehouseId(
          line.warehouseId,
        );
        await tx.stockReservationLine.create({
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
            orderId: dto.orderId,
            reservationId: reservation.id,
            actorUserId,
            reason: 'Reserve',
          },
          tx,
        );
      }

      return tx.stockReservation.findUniqueOrThrow({
        where: { id: reservation.id },
        include: { lines: true },
      });
    });
  }

  async release(id: string, actorUserId?: string) {
    return this.transition(id, ReservationStatus.RELEASED, actorUserId);
  }

  async commit(id: string, actorUserId?: string) {
    return this.transition(id, ReservationStatus.COMMITTED, actorUserId);
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

  private async transition(
    id: string,
    to: ReservationStatus,
    actorUserId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const reservation = await tx.stockReservation.findUnique({
        where: { id },
        include: { lines: true },
      });
      if (!reservation) {
        throw new NotFoundException({
          code: ErrorCodes.RES_NOT_FOUND,
          message: 'Reservation not found',
        });
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
          tx,
        );
      }

      return tx.stockReservation.update({
        where: { id },
        data: { status: to },
        include: { lines: true },
      });
    });
  }
}
