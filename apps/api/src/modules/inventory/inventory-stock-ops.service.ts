import { BadRequestException, Injectable } from '@nestjs/common';
import { ProductType, StockMovementType } from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type {
  AdjustStockDto,
  ReceiveStockDto,
  RestockDto,
} from './dto/inventory.dto';
import { InventoryLedgerService } from './inventory-ledger.service';
import { WarehouseService } from './warehouse.service';

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

  async restock(dto: RestockDto, actorUserId?: string) {
    await assertTrackedVariant(this.prisma, dto.productVariantId);
    const warehouseId = await this.warehouses.resolveWarehouseId(
      dto.warehouseId,
    );
    return this.prisma.$transaction((tx) =>
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
        tx,
      ),
    );
  }
}
