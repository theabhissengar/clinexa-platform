import { Injectable, NotFoundException } from '@nestjs/common';
import { ProductType, Prisma } from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { InventoryPolicyService } from './warehouse.service';
import { WarehouseService } from './warehouse.service';

@Injectable()
export class InventoryAvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly warehouses: WarehouseService,
    private readonly policies: InventoryPolicyService,
  ) {}

  async listBalances(params: {
    warehouseId?: string;
    q?: string;
    skip?: number;
    take?: number;
    lowStockOnly?: boolean;
  }) {
    const warehouseId = await this.warehouses.resolveWarehouseId(
      params.warehouseId,
    );
    const policy = await this.policies.getOrCreateDefault();
    const skip = params.skip ?? 0;
    const take = Math.min(params.take ?? 50, 100);

    const where: Prisma.InventoryBalanceWhereInput = { warehouseId };
    if (params.lowStockOnly) {
      // available = on_hand - reserved <= threshold
      where.AND = [
        {
          quantityOnHand: {
            lte: policy.lowStockThreshold,
          },
        },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.inventoryBalance.findMany({
        where,
        skip,
        take,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.inventoryBalance.count({ where }),
    ]);

    const variantIds = rows.map((r) => r.productVariantId);
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: { product: { select: { id: true, name: true, slug: true } } },
    });
    const byId = new Map(variants.map((v) => [v.id, v]));

    let items = rows.map((r) => {
      const v = byId.get(r.productVariantId);
      const available = r.quantityOnHand - r.quantityReserved;
      return {
        ...r,
        available,
        lowStock: available <= policy.lowStockThreshold,
        sku: v?.sku ?? null,
        label: v?.label ?? null,
        productId: v?.productId ?? null,
        productName: v?.product.name ?? null,
      };
    });

    if (params.q?.trim()) {
      const q = params.q.trim().toLowerCase();
      items = items.filter(
        (i) =>
          i.sku?.toLowerCase().includes(q) ||
          i.productName?.toLowerCase().includes(q) ||
          i.productVariantId.includes(q),
      );
    }

    return { items, total, skip, take, warehouseId };
  }

  async getBalance(variantId: string, warehouseId?: string) {
    const whId = await this.warehouses.resolveWarehouseId(warehouseId);
    const balance = await this.prisma.inventoryBalance.findUnique({
      where: {
        warehouseId_productVariantId: {
          warehouseId: whId,
          productVariantId: variantId,
        },
      },
    });
    const policy = await this.policies.getOrCreateDefault();
    if (!balance) {
      return {
        warehouseId: whId,
        productVariantId: variantId,
        quantityOnHand: 0,
        quantityReserved: 0,
        available: 0,
        lowStock: true,
        tracked: await this.isTracked(variantId),
        threshold: policy.lowStockThreshold,
      };
    }
    const available = balance.quantityOnHand - balance.quantityReserved;
    return {
      ...balance,
      available,
      lowStock: available <= policy.lowStockThreshold,
      tracked: true,
      threshold: policy.lowStockThreshold,
    };
  }

  async availabilityForProduct(productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      include: { variants: { where: { deletedAt: null } } },
    });
    if (!product) {
      throw new NotFoundException({
        code: ErrorCodes.RES_NOT_FOUND,
        message: 'Product not found',
      });
    }

    const warehouseId = await this.warehouses.resolveWarehouseId();
    const policy = await this.policies.getOrCreateDefault();

    if (product.productType === ProductType.DIGITAL) {
      return {
        productId: product.id,
        source: 'inventory_module' as const,
        tracked: false,
        available: true,
        message: 'Digital product — inventory not tracked',
        variants: product.variants.map((v) => ({
          variantId: v.id,
          sku: v.sku,
          tracked: false,
          balance: null,
        })),
      };
    }

    const variants = [];
    for (const v of product.variants) {
      if (!v.isFulfillable) {
        variants.push({
          variantId: v.id,
          sku: v.sku,
          tracked: false,
          balance: null,
          available: null,
        });
        continue;
      }
      const bal = await this.prisma.inventoryBalance.findUnique({
        where: {
          warehouseId_productVariantId: {
            warehouseId,
            productVariantId: v.id,
          },
        },
      });
      const onHand = bal?.quantityOnHand ?? 0;
      const reserved = bal?.quantityReserved ?? 0;
      const available = onHand - reserved;
      variants.push({
        variantId: v.id,
        sku: v.sku,
        tracked: true,
        balance: onHand,
        quantityReserved: reserved,
        available,
        lowStock: available <= policy.lowStockThreshold,
      });
    }

    return {
      productId: product.id,
      source: 'inventory_module' as const,
      tracked: true,
      available: variants.some((v) => (v.available ?? 0) > 0),
      message: null as string | null,
      warehouseId,
      variants,
    };
  }

  async availabilityQuery(params: {
    productVariantId?: string;
    productId?: string;
    warehouseId?: string;
  }) {
    if (params.productId) {
      return this.availabilityForProduct(params.productId);
    }
    if (params.productVariantId) {
      return this.getBalance(params.productVariantId, params.warehouseId);
    }
    throw new NotFoundException({
      code: ErrorCodes.VAL_MISSING_FIELD,
      message: 'productId or productVariantId required',
    });
  }

  async dashboard() {
    const warehouse = await this.warehouses.ensureDefaultWarehouse();
    const policy = await this.policies.getOrCreateDefault();
    const balances = await this.prisma.inventoryBalance.findMany({
      where: { warehouseId: warehouse.id },
    });
    let lowStock = 0;
    let reservedTotal = 0;
    let onHandTotal = 0;
    for (const b of balances) {
      const available = b.quantityOnHand - b.quantityReserved;
      if (available <= policy.lowStockThreshold) lowStock += 1;
      reservedTotal += b.quantityReserved;
      onHandTotal += b.quantityOnHand;
    }
    const pendingReservations = await this.prisma.stockReservation.count({
      where: { status: 'PENDING' },
    });
    return {
      warehouseId: warehouse.id,
      warehouseCode: warehouse.code,
      skuCount: balances.length,
      lowStockCount: lowStock,
      onHandTotal,
      reservedTotal,
      pendingReservations,
      lowStockThreshold: policy.lowStockThreshold,
      oversellMode: policy.oversellMode,
    };
  }

  private async isTracked(productVariantId: string) {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: productVariantId, deletedAt: null },
      include: { product: true },
    });
    if (!variant) return false;
    return (
      variant.isFulfillable &&
      variant.product.productType !== ProductType.DIGITAL
    );
  }
}

@Injectable()
export class InventoryMovementQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: {
    warehouseId?: string;
    productVariantId?: string;
    orderId?: string;
    movementType?: string;
    skip?: number;
    take?: number;
  }) {
    const skip = params.skip ?? 0;
    const take = Math.min(params.take ?? 50, 100);
    const where: Prisma.StockMovementWhereInput = {};
    if (params.warehouseId) where.warehouseId = params.warehouseId;
    if (params.productVariantId)
      where.productVariantId = params.productVariantId;
    if (params.orderId) where.orderId = params.orderId;
    if (params.movementType) {
      where.movementType = params.movementType as never;
    }

    const [items, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.stockMovement.count({ where }),
    ]);
    return { items, total, skip, take };
  }
}

@Injectable()
export class InventoryPurgeService {
  constructor(private readonly prisma: PrismaService) {}

  /** Class D — bounded cleanup of zero balance projection rows. */
  async purge(dryRun = false) {
    const candidates = await this.prisma.inventoryBalance.findMany({
      where: { quantityOnHand: 0, quantityReserved: 0 },
      take: 100,
      select: { id: true },
    });
    if (dryRun) {
      return {
        dryRun: true,
        wouldDelete: candidates.length,
        ids: candidates.map((c) => c.id),
      };
    }
    const ids = candidates.map((c) => c.id);
    if (ids.length === 0) {
      return { dryRun: false, deleted: 0 };
    }
    const result = await this.prisma.inventoryBalance.deleteMany({
      where: { id: { in: ids } },
    });
    return { dryRun: false, deleted: result.count };
  }
}
