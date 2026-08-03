import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CategoryLifecycleStatus,
  Prisma,
  ProductLifecycleStatus,
  ProductType,
} from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { InventoryAvailabilityService } from '../inventory/inventory-query.service';
import { ProductLifecycleService } from './product-lifecycle.service';

export type CreateProductInput = {
  name: string;
  slug: string;
  description?: string;
  shortDescription?: string;
  isRxEligible?: boolean;
  isFeatured?: boolean;
  productType?: ProductType;
  brandId?: string;
  brandName?: string;
  featuredMediaAssetId?: string;
  seoTitle?: string;
  seoDescription?: string;
  seoCanonical?: string;
  tags?: string[];
  medicalInfo?: unknown;
  attributes?: unknown;
  questionnaireBindingRef?: string;
  categoryIds?: string[];
  gtin?: string | null;
  soldIndividually?: boolean;
  weightLbs?: number | null;
  lengthIn?: number | null;
  widthIn?: number | null;
  heightIn?: number | null;
  shippingClass?: string | null;
  oneTimeShipping?: boolean;
  bundleSellsTitle?: string | null;
  bundleSellsDiscount?: string | null;
  defaultVariationOptions?: Record<string, string> | null;
  purchaseNote?: string | null;
  menuOrder?: number;
  enableReviews?: boolean;
  limitSubscription?: string | null;
  stripeButtonPosition?: string | null;
  stripeGateways?: unknown;
  upsellIds?: string[];
  crossSellIds?: string[];
  bundleSellIds?: string[];
};

export type UpdateProductInput = Partial<CreateProductInput>;

const RELATION_UPSELL = 'upsell';
const RELATION_CROSS_SELL = 'cross_sell';
const RELATION_BUNDLE_SELL = 'bundle_sell';

const productAdminInclude = {
  variants: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' as const },
  },
  categoryLinks: { include: { category: true } },
  media: { orderBy: { sortOrder: 'asc' as const } },
  relationsFrom: {
    include: {
      target: { select: { id: true, name: true, slug: true } },
    },
  },
} satisfies Prisma.ProductInclude;

function decimalOrNull(value: number | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return value;
}

function jsonOrDbNull(
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value;
}

function productDataFields(input: CreateProductInput | UpdateProductInput) {
  return {
    ...(input.gtin !== undefined ? { gtin: input.gtin } : {}),
    ...(input.soldIndividually !== undefined
      ? { soldIndividually: input.soldIndividually }
      : {}),
    ...(input.weightLbs !== undefined
      ? { weightLbs: decimalOrNull(input.weightLbs) }
      : {}),
    ...(input.lengthIn !== undefined
      ? { lengthIn: decimalOrNull(input.lengthIn) }
      : {}),
    ...(input.widthIn !== undefined
      ? { widthIn: decimalOrNull(input.widthIn) }
      : {}),
    ...(input.heightIn !== undefined
      ? { heightIn: decimalOrNull(input.heightIn) }
      : {}),
    ...(input.shippingClass !== undefined
      ? { shippingClass: input.shippingClass }
      : {}),
    ...(input.oneTimeShipping !== undefined
      ? { oneTimeShipping: input.oneTimeShipping }
      : {}),
    ...(input.bundleSellsTitle !== undefined
      ? { bundleSellsTitle: input.bundleSellsTitle }
      : {}),
    ...(input.bundleSellsDiscount !== undefined
      ? { bundleSellsDiscount: input.bundleSellsDiscount }
      : {}),
    ...(input.defaultVariationOptions !== undefined
      ? {
          defaultVariationOptions: jsonOrDbNull(input.defaultVariationOptions),
        }
      : {}),
    ...(input.purchaseNote !== undefined
      ? { purchaseNote: input.purchaseNote }
      : {}),
    ...(input.menuOrder !== undefined ? { menuOrder: input.menuOrder } : {}),
    ...(input.enableReviews !== undefined
      ? { enableReviews: input.enableReviews }
      : {}),
    ...(input.limitSubscription !== undefined
      ? { limitSubscription: input.limitSubscription }
      : {}),
    ...(input.stripeButtonPosition !== undefined
      ? { stripeButtonPosition: input.stripeButtonPosition }
      : {}),
    ...(input.stripeGateways !== undefined
      ? { stripeGateways: jsonOrDbNull(input.stripeGateways) }
      : {}),
  };
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: ProductLifecycleService,
    private readonly inventoryAvailability: InventoryAvailabilityService,
  ) {}

  async listAdmin(params: {
    q?: string;
    status?: ProductLifecycleStatus;
    isRxEligible?: boolean;
    isFeatured?: boolean;
    productType?: ProductType;
    categoryId?: string;
    brandName?: string;
    skip?: number;
    take?: number;
  }) {
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(params.status ? { lifecycleStatus: params.status } : {}),
      ...(params.isRxEligible !== undefined
        ? { isRxEligible: params.isRxEligible }
        : {}),
      ...(params.isFeatured !== undefined
        ? { isFeatured: params.isFeatured }
        : {}),
      ...(params.productType ? { productType: params.productType } : {}),
      ...(params.brandName
        ? { brandName: { contains: params.brandName, mode: 'insensitive' } }
        : {}),
      ...(params.categoryId
        ? { categoryLinks: { some: { categoryId: params.categoryId } } }
        : {}),
      ...(params.q
        ? {
            OR: [
              { name: { contains: params.q, mode: 'insensitive' } },
              { slug: { contains: params.q, mode: 'insensitive' } },
              {
                variants: {
                  some: {
                    deletedAt: null,
                    sku: { contains: params.q, mode: 'insensitive' },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [items, total, statusCounts] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: productAdminInclude,
        orderBy: { updatedAt: 'desc' },
        skip: params.skip ?? 0,
        take: Math.min(params.take ?? 50, 100),
      }),
      this.prisma.product.count({ where }),
      this.countByStatus(),
    ]);

    return { items, total, statusCounts };
  }

  async countByStatus() {
    const rows = await this.prisma.product.groupBy({
      by: ['lifecycleStatus'],
      where: { deletedAt: null },
      _count: { _all: true },
    });
    const counts: Record<string, number> = {
      ALL: 0,
      DRAFT: 0,
      REVIEW: 0,
      PUBLISHED: 0,
      UNPUBLISHED: 0,
      ARCHIVED: 0,
    };
    for (const row of rows) {
      counts[row.lifecycleStatus] = row._count._all;
      counts.ALL += row._count._all;
    }
    return counts;
  }

  async getAdminById(id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: productAdminInclude,
    });
    if (!product) {
      throw new NotFoundException({
        code: ErrorCodes.RES_NOT_FOUND,
        message: 'Product not found',
      });
    }
    return product;
  }

  async create(input: CreateProductInput, actorId?: string) {
    await this.assertSlugAvailable(input.slug);

    const product = await this.prisma.product.create({
      data: {
        name: input.name,
        slug: input.slug,
        description: input.description,
        shortDescription: input.shortDescription,
        isRxEligible: input.isRxEligible ?? false,
        isFeatured: input.isFeatured ?? false,
        productType: input.productType ?? ProductType.STANDARD,
        brandId: input.brandId,
        brandName: input.brandName,
        featuredMediaAssetId: input.featuredMediaAssetId,
        seoTitle: input.seoTitle,
        seoDescription: input.seoDescription,
        seoCanonical: input.seoCanonical,
        tags: input.tags ?? [],
        medicalInfo: input.medicalInfo as Prisma.InputJsonValue | undefined,
        attributes: input.attributes as Prisma.InputJsonValue | undefined,
        questionnaireBindingRef: input.questionnaireBindingRef,
        gtin: input.gtin ?? undefined,
        soldIndividually: input.soldIndividually ?? false,
        weightLbs: input.weightLbs ?? undefined,
        lengthIn: input.lengthIn ?? undefined,
        widthIn: input.widthIn ?? undefined,
        heightIn: input.heightIn ?? undefined,
        shippingClass: input.shippingClass ?? undefined,
        oneTimeShipping: input.oneTimeShipping ?? false,
        bundleSellsTitle: input.bundleSellsTitle ?? undefined,
        bundleSellsDiscount: input.bundleSellsDiscount ?? undefined,
        defaultVariationOptions:
          (input.defaultVariationOptions as Prisma.InputJsonValue) ?? undefined,
        purchaseNote: input.purchaseNote ?? undefined,
        menuOrder: input.menuOrder ?? 0,
        enableReviews: input.enableReviews ?? true,
        limitSubscription: input.limitSubscription ?? undefined,
        stripeButtonPosition: input.stripeButtonPosition ?? undefined,
        stripeGateways:
          (input.stripeGateways as Prisma.InputJsonValue) ?? undefined,
        lifecycleStatus: ProductLifecycleStatus.DRAFT,
        categoryLinks: input.categoryIds?.length
          ? {
              create: input.categoryIds.map((categoryId) => ({ categoryId })),
            }
          : undefined,
      },
      include: productAdminInclude,
    });

    await this.syncRelations(product.id, input);

    await this.recordHistory(product.id, actorId, 'create', {
      after: { name: product.name, slug: product.slug },
    });
    await this.recordActivity(
      product.id,
      actorId,
      'created',
      'Product created',
    );

    return this.getAdminById(product.id);
  }

  async update(id: string, input: UpdateProductInput, actorId?: string) {
    const existing = await this.getAdminById(id);
    if (input.slug && input.slug !== existing.slug) {
      await this.assertSlugAvailable(input.slug, id);
    }

    await this.prisma.product.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.slug !== undefined ? { slug: input.slug } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.shortDescription !== undefined
          ? { shortDescription: input.shortDescription }
          : {}),
        ...(input.isRxEligible !== undefined
          ? { isRxEligible: input.isRxEligible }
          : {}),
        ...(input.isFeatured !== undefined
          ? { isFeatured: input.isFeatured }
          : {}),
        ...(input.productType !== undefined
          ? { productType: input.productType }
          : {}),
        ...(input.brandId !== undefined ? { brandId: input.brandId } : {}),
        ...(input.brandName !== undefined
          ? { brandName: input.brandName }
          : {}),
        ...(input.featuredMediaAssetId !== undefined
          ? { featuredMediaAssetId: input.featuredMediaAssetId }
          : {}),
        ...(input.seoTitle !== undefined ? { seoTitle: input.seoTitle } : {}),
        ...(input.seoDescription !== undefined
          ? { seoDescription: input.seoDescription }
          : {}),
        ...(input.seoCanonical !== undefined
          ? { seoCanonical: input.seoCanonical }
          : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
        ...(input.medicalInfo !== undefined
          ? { medicalInfo: input.medicalInfo as Prisma.InputJsonValue }
          : {}),
        ...(input.attributes !== undefined
          ? { attributes: input.attributes as Prisma.InputJsonValue }
          : {}),
        ...(input.questionnaireBindingRef !== undefined
          ? { questionnaireBindingRef: input.questionnaireBindingRef }
          : {}),
        ...productDataFields(input),
      },
    });

    await this.recordHistory(id, actorId, 'update', {
      before: { name: existing.name, slug: existing.slug },
      after: input as Prisma.InputJsonValue,
    });
    await this.recordActivity(id, actorId, 'updated', 'Product updated');

    if (input.categoryIds !== undefined) {
      await this.setCategories(id, input.categoryIds, actorId);
    }

    await this.syncRelations(id, input);

    return this.getAdminById(id);
  }

  async duplicate(id: string, actorId?: string) {
    const source = await this.getAdminById(id);
    const baseSlug = `${source.slug}-copy`;
    let slug = baseSlug;
    let n = 1;
    while (
      await this.prisma.product.findFirst({
        where: { slug, deletedAt: null },
      })
    ) {
      slug = `${baseSlug}-${n++}`;
    }

    const product = await this.prisma.product.create({
      data: {
        name: `${source.name} (Copy)`,
        slug,
        description: source.description,
        shortDescription: source.shortDescription,
        isRxEligible: source.isRxEligible,
        isFeatured: false,
        productType: source.productType,
        brandId: source.brandId,
        brandName: source.brandName,
        featuredMediaAssetId: source.featuredMediaAssetId,
        seoTitle: source.seoTitle,
        seoDescription: source.seoDescription,
        seoCanonical: null,
        tags: source.tags,
        medicalInfo: source.medicalInfo as Prisma.InputJsonValue | undefined,
        attributes: source.attributes as Prisma.InputJsonValue | undefined,
        questionnaireBindingRef: source.questionnaireBindingRef,
        gtin: source.gtin,
        soldIndividually: source.soldIndividually,
        weightLbs: source.weightLbs,
        lengthIn: source.lengthIn,
        widthIn: source.widthIn,
        heightIn: source.heightIn,
        shippingClass: source.shippingClass,
        oneTimeShipping: source.oneTimeShipping,
        bundleSellsTitle: source.bundleSellsTitle,
        bundleSellsDiscount: source.bundleSellsDiscount,
        defaultVariationOptions: source.defaultVariationOptions as
          Prisma.InputJsonValue | undefined,
        purchaseNote: source.purchaseNote,
        menuOrder: source.menuOrder,
        enableReviews: source.enableReviews,
        limitSubscription: source.limitSubscription,
        stripeButtonPosition: source.stripeButtonPosition,
        stripeGateways: source.stripeGateways as
          Prisma.InputJsonValue | undefined,
        lifecycleStatus: ProductLifecycleStatus.DRAFT,
        categoryLinks: {
          create: source.categoryLinks.map((link) => ({
            categoryId: link.categoryId,
          })),
        },
        variants: {
          create: source.variants.map((v, index) => ({
            sku: `${v.sku}-copy${index > 0 ? `-${index}` : ''}-${Date.now().toString(36)}`,
            label: v.label,
            priceCents: v.priceCents,
            salePriceCents: v.salePriceCents,
            currency: v.currency,
            isFulfillable: v.isFulfillable,
            optionValues: v.optionValues as Prisma.InputJsonValue | undefined,
          })),
        },
        media: {
          create: source.media.map((m) => ({
            mediaAssetId: m.mediaAssetId,
            alt: m.alt,
            sortOrder: m.sortOrder,
          })),
        },
      },
      include: productAdminInclude,
    });

    await this.recordHistory(product.id, actorId, 'duplicate', {
      sourceId: id,
    });
    await this.recordActivity(
      product.id,
      actorId,
      'duplicated',
      `Duplicated from ${source.name}`,
      { sourceId: id },
    );

    return product;
  }

  async setCategories(id: string, categoryIds: string[], actorId?: string) {
    await this.getAdminById(id);
    await this.prisma.$transaction([
      this.prisma.productCategoryLink.deleteMany({ where: { productId: id } }),
      this.prisma.productCategoryLink.createMany({
        data: categoryIds.map((categoryId) => ({ productId: id, categoryId })),
      }),
    ]);
    await this.recordActivity(
      id,
      actorId,
      'categories_set',
      'Category links updated',
      {
        categoryIds,
      },
    );
    return this.getAdminById(id);
  }

  private async syncRelations(
    sourceId: string,
    input: Pick<
      CreateProductInput,
      'upsellIds' | 'crossSellIds' | 'bundleSellIds'
    >,
  ) {
    const groups: Array<{ type: string; ids?: string[] }> = [
      { type: RELATION_UPSELL, ids: input.upsellIds },
      { type: RELATION_CROSS_SELL, ids: input.crossSellIds },
      { type: RELATION_BUNDLE_SELL, ids: input.bundleSellIds },
    ];

    for (const group of groups) {
      if (group.ids === undefined) continue;
      const uniqueIds = [...new Set(group.ids.filter((id) => id !== sourceId))];
      await this.prisma.productRelation.deleteMany({
        where: { sourceId, relationType: group.type },
      });
      if (uniqueIds.length) {
        await this.prisma.productRelation.createMany({
          data: uniqueIds.map((targetId) => ({
            sourceId,
            targetId,
            relationType: group.type,
          })),
        });
      }
    }
  }

  async transition(
    id: string,
    target: ProductLifecycleStatus,
    actorId?: string,
  ) {
    const product = await this.getAdminById(id);
    this.lifecycle.assertTransition(product.lifecycleStatus, target);
    if (target === ProductLifecycleStatus.PUBLISHED) {
      this.lifecycle.assertPublishSafety(product);
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: { lifecycleStatus: target },
      include: productAdminInclude,
    });

    await this.recordHistory(id, actorId, 'lifecycle', {
      from: product.lifecycleStatus,
      to: target,
    });
    await this.recordActivity(
      id,
      actorId,
      'lifecycle',
      `Lifecycle → ${target}`,
      { from: product.lifecycleStatus, to: target },
    );

    return updated;
  }

  async softDelete(id: string, actorId?: string) {
    const product = await this.getAdminById(id);
    if (product.lifecycleStatus === ProductLifecycleStatus.PUBLISHED) {
      throw new BadRequestException({
        code: ErrorCodes.PRD_RETENTION_BLOCK,
        message: 'Unpublish or archive before deleting a published product',
      });
    }

    await this.prisma.product.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        lifecycleStatus: ProductLifecycleStatus.ARCHIVED,
      },
    });
    await this.recordHistory(id, actorId, 'delete', { soft: true });
    await this.recordActivity(id, actorId, 'deleted', 'Product soft-deleted');
    return { id, deleted: true };
  }

  async bulkSoftDelete(ids: string[], actorId?: string) {
    const results = [];
    for (const id of ids) {
      try {
        results.push(await this.softDelete(id, actorId));
      } catch (error) {
        results.push({
          id,
          deleted: false,
          error: error instanceof Error ? error.message : 'failed',
        });
      }
    }
    return { results };
  }

  async toggleFeatured(id: string, actorId?: string) {
    const product = await this.getAdminById(id);
    const updated = await this.prisma.product.update({
      where: { id },
      data: { isFeatured: !product.isFeatured },
      include: productAdminInclude,
    });
    await this.recordActivity(
      id,
      actorId,
      'featured_toggled',
      updated.isFeatured ? 'Marked featured' : 'Unmarked featured',
    );
    return updated;
  }

  async listHistory(id: string) {
    await this.getAdminById(id);
    return this.prisma.productChangeHistory.findMany({
      where: { productId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async listActivity(id: string) {
    await this.getAdminById(id);
    return this.prisma.productActivity.findMany({
      where: { productId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /** Inventory is owned elsewhere — return a stub summary only. */
  async inventorySummary(id: string) {
    return this.inventoryAvailability.availabilityForProduct(id);
  }

  private async assertSlugAvailable(slug: string, excludeId?: string) {
    const existing = await this.prisma.product.findFirst({
      where: {
        slug,
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (existing) {
      throw new ConflictException({
        code: ErrorCodes.PRD_CONFLICT,
        message: `Product slug already in use: ${slug}`,
      });
    }
  }

  private async recordHistory(
    productId: string,
    actorId: string | undefined,
    action: string,
    changes: Prisma.InputJsonValue,
  ) {
    await this.prisma.productChangeHistory.create({
      data: { productId, actorId, action, changes },
    });
  }

  private async recordActivity(
    productId: string,
    actorId: string | undefined,
    kind: string,
    summary: string,
    metadata?: Prisma.InputJsonValue,
  ) {
    await this.prisma.productActivity.create({
      data: { productId, actorId, kind, summary, metadata },
    });
  }
}

export { CategoryLifecycleStatus, ProductLifecycleStatus, ProductType };
