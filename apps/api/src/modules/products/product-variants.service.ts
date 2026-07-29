import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ProductsService } from './products.service';

@Injectable()
export class ProductVariantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
  ) {}

  async list(productId: string) {
    await this.products.getAdminById(productId);
    return this.prisma.productVariant.findMany({
      where: { productId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(
    productId: string,
    input: {
      sku: string;
      label?: string;
      priceCents: number;
      salePriceCents?: number | null;
      currency?: string;
      isFulfillable?: boolean;
      optionValues?: unknown;
    },
    actorId?: string,
  ) {
    await this.products.getAdminById(productId);
    if (input.priceCents < 0) {
      throw new ConflictException({
        code: ErrorCodes.VAL_INVALID_FORMAT,
        message: 'priceCents must be non-negative',
      });
    }
    await this.assertSkuAvailable(input.sku);

    const variant = await this.prisma.productVariant.create({
      data: {
        productId,
        sku: input.sku,
        label: input.label,
        priceCents: input.priceCents,
        salePriceCents: input.salePriceCents ?? undefined,
        currency: input.currency ?? 'USD',
        isFulfillable: input.isFulfillable ?? true,
        optionValues: input.optionValues as Prisma.InputJsonValue | undefined,
      },
    });

    await this.prisma.productActivity.create({
      data: {
        productId,
        actorId,
        kind: 'variant_created',
        summary: `Variant ${variant.sku} created`,
        metadata: { variantId: variant.id },
      },
    });

    return variant;
  }

  async update(
    productId: string,
    variantId: string,
    input: {
      sku?: string;
      label?: string;
      priceCents?: number;
      salePriceCents?: number | null;
      currency?: string;
      isFulfillable?: boolean;
      optionValues?: unknown;
    },
  ) {
    await this.products.getAdminById(productId);
    const existing = await this.prisma.productVariant.findFirst({
      where: { id: variantId, productId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException({
        code: ErrorCodes.RES_NOT_FOUND,
        message: 'Variant not found',
      });
    }
    if (input.priceCents !== undefined && input.priceCents < 0) {
      throw new ConflictException({
        code: ErrorCodes.VAL_INVALID_FORMAT,
        message: 'priceCents must be non-negative',
      });
    }
    if (input.sku && input.sku !== existing.sku) {
      await this.assertSkuAvailable(input.sku);
    }

    return this.prisma.productVariant.update({
      where: { id: variantId },
      data: {
        ...(input.sku !== undefined ? { sku: input.sku } : {}),
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.priceCents !== undefined
          ? { priceCents: input.priceCents }
          : {}),
        ...(input.salePriceCents !== undefined
          ? { salePriceCents: input.salePriceCents }
          : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.isFulfillable !== undefined
          ? { isFulfillable: input.isFulfillable }
          : {}),
        ...(input.optionValues !== undefined
          ? { optionValues: input.optionValues as Prisma.InputJsonValue }
          : {}),
      },
    });
  }

  async softDelete(productId: string, variantId: string, actorId?: string) {
    await this.products.getAdminById(productId);
    const existing = await this.prisma.productVariant.findFirst({
      where: { id: variantId, productId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException({
        code: ErrorCodes.RES_NOT_FOUND,
        message: 'Variant not found',
      });
    }
    await this.prisma.productVariant.update({
      where: { id: variantId },
      data: { deletedAt: new Date() },
    });
    await this.prisma.productActivity.create({
      data: {
        productId,
        actorId,
        kind: 'variant_deleted',
        summary: `Variant ${existing.sku} removed`,
        metadata: { variantId },
      },
    });
    return { id: variantId, deleted: true };
  }

  private async assertSkuAvailable(sku: string) {
    const existing = await this.prisma.productVariant.findFirst({
      where: { sku, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException({
        code: ErrorCodes.PRD_CONFLICT,
        message: `SKU already in use: ${sku}`,
      });
    }
  }
}
