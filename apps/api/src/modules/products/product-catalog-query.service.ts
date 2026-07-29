import { Injectable, NotFoundException } from '@nestjs/common';
import { ProductLifecycleStatus } from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class ProductCatalogQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublished(params: { q?: string; skip?: number; take?: number }) {
    const where = {
      deletedAt: null,
      lifecycleStatus: ProductLifecycleStatus.PUBLISHED,
      ...(params.q
        ? {
            OR: [
              { name: { contains: params.q, mode: 'insensitive' as const } },
              { slug: { contains: params.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          shortDescription: true,
          isRxEligible: true,
          isFeatured: true,
          brandName: true,
          featuredMediaAssetId: true,
          seoTitle: true,
          seoDescription: true,
          tags: true,
          variants: {
            where: { deletedAt: null, isFulfillable: true },
            select: {
              id: true,
              sku: true,
              label: true,
              priceCents: true,
              salePriceCents: true,
              currency: true,
            },
          },
          media: {
            orderBy: { sortOrder: 'asc' },
            select: { mediaAssetId: true, alt: true, sortOrder: true },
          },
          categoryLinks: {
            select: {
              category: {
                select: { id: true, name: true, slug: true },
              },
            },
          },
        },
        orderBy: { name: 'asc' },
        skip: params.skip ?? 0,
        take: Math.min(params.take ?? 50, 100),
      }),
      this.prisma.product.count({ where }),
    ]);

    return { items, total };
  }

  async getPublishedBySlug(slug: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        slug,
        deletedAt: null,
        lifecycleStatus: ProductLifecycleStatus.PUBLISHED,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        shortDescription: true,
        isRxEligible: true,
        isFeatured: true,
        brandName: true,
        featuredMediaAssetId: true,
        seoTitle: true,
        seoDescription: true,
        seoCanonical: true,
        tags: true,
        medicalInfo: true,
        attributes: true,
        variants: {
          where: { deletedAt: null, isFulfillable: true },
          select: {
            id: true,
            sku: true,
            label: true,
            priceCents: true,
            salePriceCents: true,
            currency: true,
            optionValues: true,
          },
        },
        media: {
          orderBy: { sortOrder: 'asc' },
          select: { mediaAssetId: true, alt: true, sortOrder: true },
        },
        categoryLinks: {
          select: {
            category: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException({
        code: ErrorCodes.RES_NOT_FOUND,
        message: 'Product not found',
      });
    }
    return product;
  }

  async getPublishedById(id: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        id,
        deletedAt: null,
        lifecycleStatus: ProductLifecycleStatus.PUBLISHED,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        isRxEligible: true,
        seoTitle: true,
        seoDescription: true,
        tags: true,
        variants: {
          where: { deletedAt: null, isFulfillable: true },
          select: {
            id: true,
            sku: true,
            label: true,
            priceCents: true,
            currency: true,
          },
        },
        media: {
          orderBy: { sortOrder: 'asc' },
          select: { mediaAssetId: true, alt: true, sortOrder: true },
        },
      },
    });

    if (!product) {
      throw new NotFoundException({
        code: ErrorCodes.RES_NOT_FOUND,
        message: 'Product not found',
      });
    }
    return product;
  }
}
