import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CouponDiscountType,
  CouponRedemptionStatus,
  CouponScopeType,
  Prisma,
} from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CouponValidationService } from './coupon-validation.service';
import type { RecordRedemptionResult } from './promotion.types';

@Injectable()
export class CouponsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validation: CouponValidationService,
  ) {}

  async listCoupons(params: {
    q?: string;
    isActive?: boolean;
    skip?: number;
    take?: number;
    includeDeleted?: boolean;
  }) {
    const skip = params.skip ?? 0;
    const take = Math.min(params.take ?? 50, 100);
    const where: Prisma.CouponWhereInput = {};
    if (!params.includeDeleted) {
      where.deletedAt = null;
    }
    if (params.isActive !== undefined) {
      where.isActive = params.isActive;
    }
    if (params.q?.trim()) {
      const q = params.q.trim();
      where.OR = [
        { code: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.coupon.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.coupon.count({ where }),
    ]);
    return { items, total, skip, take };
  }

  async getCoupon(id: string, includeDeleted = false) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    if (!coupon || (!includeDeleted && coupon.deletedAt != null)) {
      throw new NotFoundException({
        code: ErrorCodes.CPN_NOT_FOUND,
        message: 'Coupon not found',
      });
    }
    return coupon;
  }

  async createCoupon(input: {
    code: string;
    name: string;
    description?: string;
    isActive?: boolean;
    discountType: CouponDiscountType;
    discountValue: number;
    minOrderCents?: number | null;
    maxDiscountCents?: number | null;
    startsAt?: Date | null;
    endsAt?: Date | null;
    globalUsageLimit?: number | null;
    perUserUsageLimit?: number | null;
    scopeType?: CouponScopeType;
    scopeProductIds?: string[];
    scopeCategoryIds?: string[];
  }) {
    this.assertDiscountShape(input.discountType, input.discountValue);
    const code = this.validation.normalizeCode(input.code);
    const scope = await this.assertScope({
      scopeType: input.scopeType ?? CouponScopeType.ALL,
      scopeProductIds: input.scopeProductIds ?? [],
      scopeCategoryIds: input.scopeCategoryIds ?? [],
    });
    try {
      return await this.prisma.coupon.create({
        data: {
          code,
          name: input.name.trim(),
          description: input.description ?? null,
          isActive: input.isActive ?? true,
          isAutomatic: false,
          applicability: 'ORDER',
          discountType: input.discountType,
          discountValue: input.discountValue,
          minOrderCents: input.minOrderCents ?? null,
          maxDiscountCents: input.maxDiscountCents ?? null,
          startsAt: input.startsAt ?? null,
          endsAt: input.endsAt ?? null,
          globalUsageLimit: input.globalUsageLimit ?? null,
          perUserUsageLimit: input.perUserUsageLimit ?? null,
          scopeType: scope.scopeType,
          scopeProductIds: scope.scopeProductIds,
          scopeCategoryIds: scope.scopeCategoryIds,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: ErrorCodes.VAL_INVALID_FORMAT,
          message: 'Coupon code already exists',
        });
      }
      throw error;
    }
  }

  async updateCoupon(
    id: string,
    input: {
      name?: string;
      description?: string | null;
      isActive?: boolean;
      discountType?: CouponDiscountType;
      discountValue?: number;
      minOrderCents?: number | null;
      maxDiscountCents?: number | null;
      startsAt?: Date | null;
      endsAt?: Date | null;
      globalUsageLimit?: number | null;
      perUserUsageLimit?: number | null;
      scopeType?: CouponScopeType;
      scopeProductIds?: string[];
      scopeCategoryIds?: string[];
    },
  ) {
    const existing = await this.getCoupon(id);
    const discountType = input.discountType ?? existing.discountType;
    const discountValue = input.discountValue ?? existing.discountValue;
    this.assertDiscountShape(discountType, discountValue);
    const scope = await this.assertScope({
      scopeType: input.scopeType ?? existing.scopeType,
      scopeProductIds: input.scopeProductIds ?? existing.scopeProductIds,
      scopeCategoryIds: input.scopeCategoryIds ?? existing.scopeCategoryIds,
    });
    return this.prisma.coupon.update({
      where: { id },
      data: {
        name: input.name?.trim() ?? existing.name,
        description:
          input.description === undefined
            ? existing.description
            : input.description,
        isActive: input.isActive ?? existing.isActive,
        discountType,
        discountValue,
        minOrderCents:
          input.minOrderCents === undefined
            ? existing.minOrderCents
            : input.minOrderCents,
        maxDiscountCents:
          input.maxDiscountCents === undefined
            ? existing.maxDiscountCents
            : input.maxDiscountCents,
        startsAt:
          input.startsAt === undefined ? existing.startsAt : input.startsAt,
        endsAt: input.endsAt === undefined ? existing.endsAt : input.endsAt,
        globalUsageLimit:
          input.globalUsageLimit === undefined
            ? existing.globalUsageLimit
            : input.globalUsageLimit,
        perUserUsageLimit:
          input.perUserUsageLimit === undefined
            ? existing.perUserUsageLimit
            : input.perUserUsageLimit,
        scopeType: scope.scopeType,
        scopeProductIds: scope.scopeProductIds,
        scopeCategoryIds: scope.scopeCategoryIds,
      },
    });
  }

  async deactivateCoupon(id: string) {
    await this.getCoupon(id);
    return this.prisma.coupon.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async deleteCoupon(id: string) {
    const coupon = await this.getCoupon(id);
    const redemptions = await this.prisma.couponRedemption.count({
      where: { couponId: id, status: CouponRedemptionStatus.RECORDED },
    });
    if (redemptions > 0) {
      throw new BadRequestException({
        code: ErrorCodes.CPN_RETENTION_BLOCK,
        message: 'Coupon has redemption history and cannot be deleted',
      });
    }
    return this.prisma.coupon.update({
      where: { id: coupon.id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  async listRedemptions(
    couponId: string,
    params: { skip?: number; take?: number },
  ) {
    await this.getCoupon(couponId, true);
    const skip = params.skip ?? 0;
    const take = Math.min(params.take ?? 50, 100);
    const where = { couponId };
    const [items, total] = await Promise.all([
      this.prisma.couponRedemption.findMany({
        where,
        orderBy: { redeemedAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          orderId: true,
          patientUserId: true,
          redeemedAt: true,
          discountAppliedCents: true,
          status: true,
        },
      }),
      this.prisma.couponRedemption.count({ where }),
    ]);
    return { items, total, skip, take };
  }

  /**
   * Atomic usage re-check + insert. Called only after successful capture.
   * Never rolls back payment on limit failure.
   */
  async recordRedemption(input: {
    orderId: string;
    paymentId: string;
  }): Promise<RecordRedemptionResult> {
    const order = await this.prisma.order.findUnique({
      where: { id: input.orderId },
      select: {
        id: true,
        appliedCouponId: true,
        patientUserId: true,
        discountTotalCents: true,
      },
    });
    if (!order?.appliedCouponId) {
      return { outcome: 'none' };
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT id FROM coupons WHERE id = ${order.appliedCouponId}::uuid FOR UPDATE
      `;

      const existing = await tx.couponRedemption.findFirst({
        where: {
          orderId: order.id,
          couponId: order.appliedCouponId!,
          status: CouponRedemptionStatus.RECORDED,
        },
      });
      if (existing) {
        return {
          outcome: 'recorded' as const,
          redemptionId: existing.id,
          alreadyExisted: true,
        };
      }

      const coupon = await tx.coupon.findUnique({
        where: { id: order.appliedCouponId! },
      });
      if (!coupon) {
        return {
          outcome: 'limit_exceeded' as const,
          errorCode: ErrorCodes.CPN_REDEMPTION_LIMIT,
          couponId: order.appliedCouponId!,
          orderId: order.id,
          paymentId: input.paymentId,
        };
      }

      const recordedCount = await tx.couponRedemption.count({
        where: {
          couponId: coupon.id,
          status: CouponRedemptionStatus.RECORDED,
        },
      });
      const perUserCount = await tx.couponRedemption.count({
        where: {
          couponId: coupon.id,
          patientUserId: order.patientUserId,
          status: CouponRedemptionStatus.RECORDED,
        },
      });

      const globalExceeded =
        coupon.globalUsageLimit != null &&
        recordedCount >= coupon.globalUsageLimit;
      const perUserExceeded =
        coupon.perUserUsageLimit != null &&
        perUserCount >= coupon.perUserUsageLimit;

      if (globalExceeded || perUserExceeded) {
        await tx.couponRedemption.create({
          data: {
            couponId: coupon.id,
            orderId: order.id,
            paymentId: input.paymentId,
            patientUserId: order.patientUserId,
            discountAppliedCents: order.discountTotalCents,
            status: CouponRedemptionStatus.FAILED_LIMIT,
          },
        });
        return {
          outcome: 'limit_exceeded' as const,
          errorCode: ErrorCodes.CPN_REDEMPTION_LIMIT,
          couponId: coupon.id,
          orderId: order.id,
          paymentId: input.paymentId,
        };
      }

      const created = await tx.couponRedemption.create({
        data: {
          couponId: coupon.id,
          orderId: order.id,
          paymentId: input.paymentId,
          patientUserId: order.patientUserId,
          discountAppliedCents: order.discountTotalCents,
          status: CouponRedemptionStatus.RECORDED,
        },
      });
      await tx.coupon.update({
        where: { id: coupon.id },
        data: { usageCount: { increment: 1 } },
      });
      return {
        outcome: 'recorded' as const,
        redemptionId: created.id,
        alreadyExisted: false,
      };
    });
  }

  private async assertScope(input: {
    scopeType: CouponScopeType;
    scopeProductIds: string[];
    scopeCategoryIds: string[];
  }): Promise<{
    scopeType: CouponScopeType;
    scopeProductIds: string[];
    scopeCategoryIds: string[];
  }> {
    const productIds = uniqueIds(input.scopeProductIds);
    const categoryIds = uniqueIds(input.scopeCategoryIds);
    if (input.scopeType === CouponScopeType.ALL) {
      return {
        scopeType: CouponScopeType.ALL,
        scopeProductIds: [],
        scopeCategoryIds: [],
      };
    }
    if (input.scopeType === CouponScopeType.PRODUCT) {
      if (productIds.length === 0) {
        throw new BadRequestException({
          code: ErrorCodes.VAL_MISSING_FIELD,
          message: 'PRODUCT scope requires at least one scopeProductIds value',
        });
      }
      const found = await this.prisma.product.count({
        where: { id: { in: productIds }, deletedAt: null },
      });
      if (found !== productIds.length) {
        throw new BadRequestException({
          code: ErrorCodes.VAL_INVALID_FORMAT,
          message: 'One or more scopeProductIds do not match catalog products',
        });
      }
      return {
        scopeType: CouponScopeType.PRODUCT,
        scopeProductIds: productIds,
        scopeCategoryIds: [],
      };
    }
    if (input.scopeType === CouponScopeType.CATEGORY) {
      if (categoryIds.length === 0) {
        throw new BadRequestException({
          code: ErrorCodes.VAL_MISSING_FIELD,
          message:
            'CATEGORY scope requires at least one scopeCategoryIds value',
        });
      }
      const found = await this.prisma.category.count({
        where: { id: { in: categoryIds }, deletedAt: null },
      });
      if (found !== categoryIds.length) {
        throw new BadRequestException({
          code: ErrorCodes.VAL_INVALID_FORMAT,
          message:
            'One or more scopeCategoryIds do not match catalog categories',
        });
      }
      return {
        scopeType: CouponScopeType.CATEGORY,
        scopeProductIds: [],
        scopeCategoryIds: categoryIds,
      };
    }
    throw new BadRequestException({
      code: ErrorCodes.VAL_INVALID_FORMAT,
      message: 'Unsupported coupon scope',
    });
  }

  private assertDiscountShape(
    discountType: CouponDiscountType,
    discountValue: number,
  ): void {
    if (!Number.isInteger(discountValue) || discountValue < 1) {
      throw new BadRequestException({
        code: ErrorCodes.VAL_INVALID_FORMAT,
        message: 'discountValue must be a positive integer',
      });
    }
    if (discountType === CouponDiscountType.PERCENT && discountValue > 100) {
      throw new BadRequestException({
        code: ErrorCodes.VAL_INVALID_FORMAT,
        message: 'PERCENT discountValue cannot exceed 100',
      });
    }
  }
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0))];
}
