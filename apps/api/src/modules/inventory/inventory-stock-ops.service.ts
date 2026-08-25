import { BadRequestException, Injectable } from '@nestjs/common';
import {
  Prisma,
  ProductType,
  ReservationStatus,
  StockMovementType,
} from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type {
  AdjustStockDto,
  ReceiveStockDto,
  RestockDto,
} from './dto/inventory.dto';
import { InventoryLedgerService } from './inventory-ledger.service';
import { WarehouseService } from './warehouse.service';

type Tx = Prisma.TransactionClient;
type DbClient = Tx | PrismaService;

async function assertTrackedVariant(
  prisma: PrismaService,
  productVariantId: string,
) {
  const variant = await prisma.productVariant.findFirst({
    where: { id: productVariantId, deletedAt: null },
    include: { product: true },
  });
  if (!variant) {
    throw new BadRequestException({
      code: ErrorCodes.RES_NOT_FOUND,
      message: 'Product variant not found',
    });
  }
  if (
    !variant.isFulfillable ||
    variant.product.productType === ProductType.DIGITAL
  ) {
    throw new BadRequestException({
      code: ErrorCodes.INV_NOT_TRACKED,
      message: 'Inventory tracking is disabled for this product type',
    });
  }
  return variant;
}

@Injectable()
export class InventoryAdjustmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: InventoryLedgerService,
    private readonly warehouses: WarehouseService,
  ) {}

  async adjust(dto: AdjustStockDto, actorUserId?: string) {
    await assertTrackedVariant(this.prisma, dto.productVariantId);
    const warehouseId = await this.warehouses.resolveWarehouseId(
      dto.warehouseId,
    );
    return this.prisma.$transaction((tx) =>
      this.ledger.appendAndProject(
        {
          warehouseId,
          productVariantId: dto.productVariantId,
          movementType: StockMovementType.ADJUST,
          quantity: dto.quantityDelta,
          actorUserId,
          reason: dto.reason,
        },
        tx,
      ),
    );
  }
}

@Injectable()
export class InventoryReceivingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: InventoryLedgerService,
    private readonly warehouses: WarehouseService,
  ) {}

  async receive(dto: ReceiveStockDto, actorUserId?: string) {
    await assertTrackedVariant(this.prisma, dto.productVariantId);
    const warehouseId = await this.warehouses.resolveWarehouseId(
      dto.warehouseId,
    );
    return this.prisma.$transaction((tx) =>
      this.ledger.appendAndProject(
        {
          warehouseId,
          productVariantId: dto.productVariantId,
          movementType: StockMovementType.RECEIVE,
          quantity: dto.quantity,
          actorUserId,
          reason: dto.reason ?? 'Receiving',
        },
        tx,
      ),
    );
  }
}

@Injectable()
export class InventoryRestockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: InventoryLedgerService,
    private readonly warehouses: WarehouseService,
  ) {}

  async restock(dto: RestockDto, actorUserId?: string, tx?: Tx) {
    await assertTrackedVariant(this.prisma, dto.productVariantId);
    const warehouseId = await this.warehouses.resolveWarehouseId(
      dto.warehouseId,
    );
    const run = (client: DbClient) =>
      this.ledger.appendAndProject(
        {
          warehouseId,
          productVariantId: dto.productVariantId,
          movementType: StockMovementType.RESTOCK,
          quantity: dto.quantity,
          orderId: dto.orderId,
          actorUserId,
          reason: dto.reason ?? 'Restock',
        },
        client,
      );
    if (tx) {
      return run(tx);
    }
    return this.prisma.$transaction((inner) => run(inner));
  }

  /**
   * Post-fulfill refund path: restock each committed reservation line once.
   * Idempotent when RESTOCK movements already exist for orderId+reservationId.
   */
  async restockCommittedReservation(
    orderId: string,
    reservationId: string,
    actorUserId: string | undefined,
    tx: Tx,
  ) {
    const reservation = await tx.stockReservation.findUnique({
      where: { id: reservationId },
      include: { lines: true },
    });
    if (!reservation || reservation.orderId !== orderId) {
      return null;
    }
    if (reservation.status !== ReservationStatus.COMMITTED) {
      return null;
    }

    const existingRestock = await tx.stockMovement.findFirst({
      where: {
        orderId,
        reservationId,
        movementType: StockMovementType.RESTOCK,
      },
    });
    if (existingRestock) {
      return reservation;
    }

    for (const line of reservation.lines) {
      await this.ledger.appendAndProject(
        {
          warehouseId: line.warehouseId,
          productVariantId: line.productVariantId,
          movementType: StockMovementType.RESTOCK,
          quantity: line.quantity,
          orderId,
          reservationId,
          actorUserId,
          reason: 'Restock post-fulfill refund',
        },
        tx,
      );
    }

    return reservation;
  }
}
