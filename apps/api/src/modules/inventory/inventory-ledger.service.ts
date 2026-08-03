import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OversellMode,
  Prisma,
  StockMovementType,
  WarehouseStatus,
} from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { LowStockEventEmitter } from './low-stock-event.emitter';

type Tx = Prisma.TransactionClient;

export type LedgerAppendInput = {
  warehouseId: string;
  productVariantId: string;
  movementType: StockMovementType;
  /** Absolute quantity for the operation (always positive except ADJUST which uses signed quantityDelta). */
  quantity: number;
  orderId?: string | null;
  reservationId?: string | null;
  actorUserId?: string | null;
  reason?: string | null;
};

@Injectable()
export class InventoryLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lowStock: LowStockEventEmitter,
  ) {}

  /**
   * Append a movement and update the balance projection in the same transaction.
   * Movement ledger is source of truth; balances are derived.
   */
  async appendAndProject(
    input: LedgerAppendInput,
    client: Tx | PrismaService = this.prisma,
  ) {
    if (
      input.movementType !== StockMovementType.ADJUST &&
      input.quantity <= 0
    ) {
      throw new BadRequestException({
        code: ErrorCodes.VAL_INVALID_FORMAT,
        message: 'Quantity must be positive for this movement type',
      });
    }
    if (
      input.movementType === StockMovementType.ADJUST &&
      input.quantity === 0
    ) {
      throw new BadRequestException({
        code: ErrorCodes.VAL_INVALID_FORMAT,
        message: 'Adjust quantityDelta must be nonzero',
      });
    }

    const warehouse = await client.warehouse.findUnique({
      where: { id: input.warehouseId },
    });
    if (!warehouse || warehouse.status !== WarehouseStatus.ACTIVE) {
      throw new BadRequestException({
        code: ErrorCodes.INV_WAREHOUSE_INVALID,
        message: 'Warehouse missing or inactive',
      });
    }

    const policy = await client.inventoryPolicy.findUnique({
      where: { code: 'default' },
    });
    const oversellMode = policy?.oversellMode ?? OversellMode.PREVENT;
    const allowNegative = policy?.allowNegativeStock ?? false;
    const threshold = policy?.lowStockThreshold ?? 5;

    const existing = await client.inventoryBalance.findUnique({
      where: {
        warehouseId_productVariantId: {
          warehouseId: input.warehouseId,
          productVariantId: input.productVariantId,
        },
      },
    });

    let onHand = existing?.quantityOnHand ?? 0;
    let reserved = existing?.quantityReserved ?? 0;
    let quantityDelta = 0;

    switch (input.movementType) {
      case StockMovementType.RECEIVE:
      case StockMovementType.RESTOCK:
        onHand += input.quantity;
        quantityDelta = input.quantity;
        break;
      case StockMovementType.ADJUST:
        onHand += input.quantity;
        quantityDelta = input.quantity;
        break;
      case StockMovementType.RESERVE:
        reserved += input.quantity;
        quantityDelta = input.quantity;
        break;
      case StockMovementType.RELEASE:
        if (reserved < input.quantity) {
          throw new BadRequestException({
            code: ErrorCodes.INV_RESERVATION_INVALID,
            message: 'Cannot release more than reserved',
          });
        }
        reserved -= input.quantity;
        quantityDelta = -input.quantity;
        break;
      case StockMovementType.COMMIT:
        if (reserved < input.quantity) {
          throw new BadRequestException({
            code: ErrorCodes.INV_RESERVATION_INVALID,
            message: 'Cannot commit more than reserved',
          });
        }
        reserved -= input.quantity;
        onHand -= input.quantity;
        quantityDelta = -input.quantity;
        break;
      default:
        throw new BadRequestException({
          code: ErrorCodes.VAL_INVALID_FORMAT,
          message: `Unsupported movement type`,
        });
    }

    if (onHand < 0 || reserved < 0) {
      if (!(allowNegative && oversellMode === OversellMode.ALLOW)) {
        throw new BadRequestException({
          code: ErrorCodes.INV_INSUFFICIENT,
          message: 'Insufficient stock for this operation',
        });
      }
    }

    const available = onHand - reserved;
    if (
      oversellMode === OversellMode.PREVENT &&
      available < 0 &&
      !allowNegative
    ) {
      throw new BadRequestException({
        code: ErrorCodes.INV_INSUFFICIENT,
        message: 'Oversell prevented by inventory policy',
      });
    }

    const movement = await client.stockMovement.create({
      data: {
        warehouseId: input.warehouseId,
        productVariantId: input.productVariantId,
        movementType: input.movementType,
        quantityDelta,
        orderId: input.orderId ?? null,
        reservationId: input.reservationId ?? null,
        actorUserId: input.actorUserId ?? null,
        reason: input.reason ?? null,
      },
    });

    const balance = await client.inventoryBalance.upsert({
      where: {
        warehouseId_productVariantId: {
          warehouseId: input.warehouseId,
          productVariantId: input.productVariantId,
        },
      },
      create: {
        warehouseId: input.warehouseId,
        productVariantId: input.productVariantId,
        quantityOnHand: onHand,
        quantityReserved: reserved,
      },
      update: {
        quantityOnHand: onHand,
        quantityReserved: reserved,
      },
    });

    this.lowStock.emitIfLow(
      input.warehouseId,
      input.productVariantId,
      onHand - reserved,
      threshold,
    );

    return { movement, balance };
  }

  async getBalanceOrThrow(warehouseId: string, productVariantId: string) {
    const balance = await this.prisma.inventoryBalance.findUnique({
      where: {
        warehouseId_productVariantId: { warehouseId, productVariantId },
      },
    });
    if (!balance) {
      throw new NotFoundException({
        code: ErrorCodes.RES_NOT_FOUND,
        message: 'Inventory balance not found',
      });
    }
    return balance;
  }
}
