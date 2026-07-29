import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CategoryLifecycleStatus,
  type Prisma,
} from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

export type CategoryInput = {
  name: string;
  slug: string;
  description?: string;
  parentId?: string | null;
  seoTitle?: string;
  seoDescription?: string;
  sortOrder?: number;
  thumbnailMediaAssetId?: string | null;
  minQuantity?: number | null;
  maxQuantity?: number | null;
  groupOf?: number | null;
  displayType?: string | null;
  headerContentAlign?: string | null;
  headerTextAlign?: string | null;
  headerImageAssetId?: string | null;
  contentPermissionRoles?: string[];
};

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async listAdmin(params: {
    q?: string;
    status?: CategoryLifecycleStatus;
    skip?: number;
    take?: number;
  }) {
    const where: Prisma.CategoryWhereInput = {
      deletedAt: null,
      ...(params.status ? { lifecycleStatus: params.status } : {}),
      ...(params.q
        ? {
            OR: [
              { name: { contains: params.q, mode: 'insensitive' } },
              { slug: { contains: params.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.category.findMany({
        where,
        include: {
          parent: { select: { id: true, name: true, slug: true } },
          _count: { select: { productLinks: true, children: true } },
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        skip: params.skip ?? 0,
        take: Math.min(params.take ?? 100, 200),
      }),
      this.prisma.category.count({ where }),
    ]);

    const flattened = this.flattenHierarchy(items);

    return { items: flattened, total };
  }

  async getAdminById(id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, deletedAt: null },
      include: {
        parent: { select: { id: true, name: true, slug: true } },
        children: {
          where: { deletedAt: null },
          select: { id: true, name: true, slug: true },
          orderBy: { sortOrder: 'asc' },
        },
        productLinks: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                slug: true,
                lifecycleStatus: true,
              },
            },
          },
        },
        _count: { select: { productLinks: true } },
      },
    });
    if (!category) {
      throw new NotFoundException({
        code: ErrorCodes.RES_NOT_FOUND,
        message: 'Category not found',
      });
    }
    return category;
  }

  async create(input: CategoryInput) {
    await this.assertSlugAvailable(input.slug);
    if (input.parentId) {
      await this.assertParentExists(input.parentId);
    }
    return this.prisma.category.create({
      data: this.toCreateData(input),
      include: {
        parent: { select: { id: true, name: true, slug: true } },
        _count: { select: { productLinks: true } },
      },
    });
  }

  async update(id: string, input: Partial<CategoryInput>) {
    const existing = await this.getAdminById(id);
    if (input.slug && input.slug !== existing.slug) {
      await this.assertSlugAvailable(input.slug, id);
    }
    if (input.parentId) {
      if (input.parentId === id) {
        throw new BadRequestException({
          code: ErrorCodes.VAL_INVALID_FORMAT,
          message: 'Category cannot be its own parent',
        });
      }
      await this.assertParentExists(input.parentId);
    }
    return this.prisma.category.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.slug !== undefined ? { slug: input.slug } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        ...(input.seoTitle !== undefined ? { seoTitle: input.seoTitle } : {}),
        ...(input.seoDescription !== undefined
          ? { seoDescription: input.seoDescription }
          : {}),
        ...(input.sortOrder !== undefined
          ? { sortOrder: input.sortOrder }
          : {}),
        ...(input.thumbnailMediaAssetId !== undefined
          ? { thumbnailMediaAssetId: input.thumbnailMediaAssetId }
          : {}),
        ...(input.minQuantity !== undefined
          ? { minQuantity: input.minQuantity }
          : {}),
        ...(input.maxQuantity !== undefined
          ? { maxQuantity: input.maxQuantity }
          : {}),
        ...(input.groupOf !== undefined ? { groupOf: input.groupOf } : {}),
        ...(input.displayType !== undefined
          ? { displayType: input.displayType }
          : {}),
        ...(input.headerContentAlign !== undefined
          ? { headerContentAlign: input.headerContentAlign }
          : {}),
        ...(input.headerTextAlign !== undefined
          ? { headerTextAlign: input.headerTextAlign }
          : {}),
        ...(input.headerImageAssetId !== undefined
          ? { headerImageAssetId: input.headerImageAssetId }
          : {}),
        ...(input.contentPermissionRoles !== undefined
          ? { contentPermissionRoles: input.contentPermissionRoles }
          : {}),
      },
      include: {
        parent: { select: { id: true, name: true, slug: true } },
        _count: { select: { productLinks: true } },
      },
    });
  }

  async publish(id: string) {
    await this.getAdminById(id);
    return this.prisma.category.update({
      where: { id },
      data: { lifecycleStatus: CategoryLifecycleStatus.PUBLISHED },
    });
  }

  async unpublish(id: string) {
    await this.getAdminById(id);
    return this.prisma.category.update({
      where: { id },
      data: { lifecycleStatus: CategoryLifecycleStatus.UNPUBLISHED },
    });
  }

  async softDelete(id: string) {
    const category = await this.getAdminById(id);
    if (category.productLinks.length > 0) {
      throw new ConflictException({
        code: ErrorCodes.PRD_RETENTION_BLOCK,
        message: 'Unlink products before deleting this category',
      });
    }
    if (category.children.length > 0) {
      throw new ConflictException({
        code: ErrorCodes.PRD_RETENTION_BLOCK,
        message: 'Reassign or delete child categories first',
      });
    }
    await this.prisma.category.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        lifecycleStatus: CategoryLifecycleStatus.ARCHIVED,
      },
    });
    return { id, deleted: true };
  }

  async listPublished() {
    return this.prisma.category.findMany({
      where: {
        deletedAt: null,
        lifecycleStatus: CategoryLifecycleStatus.PUBLISHED,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        parentId: true,
        seoTitle: true,
        seoDescription: true,
        sortOrder: true,
        thumbnailMediaAssetId: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async getPublishedBySlug(slug: string) {
    const category = await this.prisma.category.findFirst({
      where: {
        slug,
        deletedAt: null,
        lifecycleStatus: CategoryLifecycleStatus.PUBLISHED,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        parentId: true,
        seoTitle: true,
        seoDescription: true,
        thumbnailMediaAssetId: true,
        productLinks: {
          where: {
            product: {
              deletedAt: null,
              lifecycleStatus: 'PUBLISHED',
            },
          },
          select: {
            product: {
              select: {
                id: true,
                name: true,
                slug: true,
                isRxEligible: true,
                seoTitle: true,
              },
            },
          },
        },
      },
    });
    if (!category) {
      throw new NotFoundException({
        code: ErrorCodes.RES_NOT_FOUND,
        message: 'Category not found',
      });
    }
    return category;
  }

  private toCreateData(input: CategoryInput): Prisma.CategoryCreateInput {
    return {
      name: input.name,
      slug: input.slug,
      description: input.description,
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,
      sortOrder: input.sortOrder ?? 0,
      thumbnailMediaAssetId: input.thumbnailMediaAssetId ?? undefined,
      minQuantity: input.minQuantity ?? undefined,
      maxQuantity: input.maxQuantity ?? undefined,
      groupOf: input.groupOf ?? undefined,
      displayType: input.displayType ?? undefined,
      headerContentAlign: input.headerContentAlign ?? undefined,
      headerTextAlign: input.headerTextAlign ?? undefined,
      headerImageAssetId: input.headerImageAssetId ?? undefined,
      contentPermissionRoles: input.contentPermissionRoles ?? [],
      lifecycleStatus: CategoryLifecycleStatus.DRAFT,
      ...(input.parentId
        ? { parent: { connect: { id: input.parentId } } }
        : {}),
    };
  }

  private flattenHierarchy<
    T extends {
      id: string;
      parentId: string | null;
      sortOrder: number;
      name: string;
    },
  >(items: T[]): Array<T & { depth: number }> {
    const byParent = new Map<string | null, T[]>();
    for (const item of items) {
      const key = item.parentId;
      const list = byParent.get(key) ?? [];
      list.push(item);
      byParent.set(key, list);
    }
    for (const list of byParent.values()) {
      list.sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      );
    }

    const result: Array<T & { depth: number }> = [];
    const visit = (parentId: string | null, depth: number) => {
      for (const item of byParent.get(parentId) ?? []) {
        result.push({ ...item, depth });
        visit(item.id, depth + 1);
      }
    };
    visit(null, 0);

    // Orphans whose parent is filtered out of this page — append at end
    const seen = new Set(result.map((r) => r.id));
    for (const item of items) {
      if (!seen.has(item.id)) {
        result.push({ ...item, depth: 0 });
      }
    }
    return result;
  }

  private async assertParentExists(parentId: string) {
    const parent = await this.prisma.category.findFirst({
      where: { id: parentId, deletedAt: null },
    });
    if (!parent) {
      throw new NotFoundException({
        code: ErrorCodes.RES_NOT_FOUND,
        message: 'Parent category not found',
      });
    }
  }

  private async assertSlugAvailable(slug: string, excludeId?: string) {
    const existing = await this.prisma.category.findFirst({
      where: {
        slug,
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (existing) {
      throw new ConflictException({
        code: ErrorCodes.PRD_CONFLICT,
        message: `Category slug already in use: ${slug}`,
      });
    }
  }
}
