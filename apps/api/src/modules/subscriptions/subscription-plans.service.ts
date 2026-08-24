import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  SubscriptionPlanStatus,
  type SubscriptionPlan,
} from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { PlanProductBinding } from './subscription.types';
import { SubscriptionsScheduleService } from './subscriptions-schedule.service';
import { SubscriptionsSnapshotService } from './subscriptions-snapshot.service';

export type ListSubscriptionPlansInput = {
  q?: string;
  lifecycleStatus?: SubscriptionPlanStatus | 'ALL';
  includeDeleted?: boolean;
  archived?: 'ACTIVE' | 'ARCHIVED' | 'ALL';
  skip?: number;
  take?: number;
};

export type CreateSubscriptionPlanInput = {
  name: string;
  slug?: string;
  description?: string | null;
  billingInterval: SubscriptionPlan['billingInterval'];
  intervalCount?: number;
  customIntervalDays?: number | null;
  currency?: string;
  priceCents: number;
  productBindings: PlanProductBinding[];
  gracePeriodDays?: number;
  requiresReassessment?: boolean;
  reassessmentIntervalCycles?: number | null;
};

export type UpdateSubscriptionPlanInput = Partial<
  Omit<CreateSubscriptionPlanInput, 'slug'>
>;

@Injectable()
export class SubscriptionPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly snapshots: SubscriptionsSnapshotService,
    private readonly schedule: SubscriptionsScheduleService,
  ) {}

  async listPlans(params: ListSubscriptionPlansInput) {
    const skip = params.skip ?? 0;
    const take = Math.min(params.take ?? 50, 100);
    const where = this.buildListWhere(params);

    const [items, total, statusCounts] = await Promise.all([
      this.prisma.subscriptionPlan.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take,
      }),
      this.prisma.subscriptionPlan.count({ where }),
      this.countByStatus(params),
    ]);

    return { items, total, statusCounts };
  }

  async getById(planId: string, options?: { includeDeleted?: boolean }) {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: planId },
    });
    if (!plan || (plan.deletedAt != null && options?.includeDeleted !== true)) {
      throw new NotFoundException({
        code: ErrorCodes.RES_NOT_FOUND,
        message: 'Subscription plan not found',
      });
    }
    return plan;
  }

  async createPlan(input: CreateSubscriptionPlanInput) {
    const intervalCount = input.intervalCount ?? 1;
    this.schedule.assertIntervalConfig({
      billingInterval: input.billingInterval,
      intervalCount,
      customIntervalDays: input.customIntervalDays ?? null,
    });
    this.assertBindingsShape(input.productBindings, { allowEmpty: true });

    const slug = this.slugify(input.slug?.trim() || input.name);
    try {
      return await this.prisma.subscriptionPlan.create({
        data: {
          name: input.name.trim(),
          slug,
          description: input.description ?? null,
          lifecycleStatus: SubscriptionPlanStatus.DRAFT,
          billingInterval: input.billingInterval,
          intervalCount,
          customIntervalDays: input.customIntervalDays ?? null,
          currency: input.currency?.trim() || 'USD',
          priceCents: input.priceCents,
          productBindings: input.productBindings,
          gracePeriodDays: input.gracePeriodDays ?? 0,
          requiresReassessment: input.requiresReassessment ?? false,
          reassessmentIntervalCycles: input.reassessmentIntervalCycles ?? null,
        },
      });
    } catch (error) {
      this.rethrowSlugConflict(error);
      throw error;
    }
  }

  async updatePlan(planId: string, input: UpdateSubscriptionPlanInput) {
    const plan = await this.requireActive(planId);
    const billingInterval = input.billingInterval ?? plan.billingInterval;
    const intervalCount = input.intervalCount ?? plan.intervalCount;
    const customIntervalDays =
      input.customIntervalDays === undefined
        ? plan.customIntervalDays
        : input.customIntervalDays;

    this.schedule.assertIntervalConfig({
      billingInterval,
      intervalCount,
      customIntervalDays,
    });
    if (input.productBindings) {
      this.assertBindingsShape(input.productBindings, { allowEmpty: true });
    }

    return this.prisma.subscriptionPlan.update({
      where: { id: plan.id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.billingInterval !== undefined
          ? { billingInterval: input.billingInterval }
          : {}),
        ...(input.intervalCount !== undefined
          ? { intervalCount: input.intervalCount }
          : {}),
        ...(input.customIntervalDays !== undefined
          ? { customIntervalDays: input.customIntervalDays }
          : {}),
        ...(input.currency !== undefined
          ? { currency: input.currency.trim() || plan.currency }
          : {}),
        ...(input.priceCents !== undefined
          ? { priceCents: input.priceCents }
          : {}),
        ...(input.productBindings !== undefined
          ? {
              productBindings: input.productBindings,
            }
          : {}),
        ...(input.gracePeriodDays !== undefined
          ? { gracePeriodDays: input.gracePeriodDays }
          : {}),
        ...(input.requiresReassessment !== undefined
          ? { requiresReassessment: input.requiresReassessment }
          : {}),
        ...(input.reassessmentIntervalCycles !== undefined
          ? {
              reassessmentIntervalCycles: input.reassessmentIntervalCycles,
            }
          : {}),
      },
    });
  }

  async publish(planId: string) {
    const plan = await this.requireActive(planId);
    if (plan.archivedAt != null) {
      throw new BadRequestException({
        code: ErrorCodes.SUB_PLAN_NOT_BINDABLE,
        message: 'Archived plans cannot be published',
      });
    }
    this.schedule.assertIntervalConfig({
      billingInterval: plan.billingInterval,
      intervalCount: plan.intervalCount,
      customIntervalDays: plan.customIntervalDays,
    });
    await this.assertBindingsBindable(plan.productBindings);
    return this.prisma.subscriptionPlan.update({
      where: { id: plan.id },
      data: {
        lifecycleStatus: SubscriptionPlanStatus.PUBLISHED,
        archivedAt: null,
      },
    });
  }

  async unpublish(planId: string) {
    const plan = await this.requireActive(planId);
    if (plan.lifecycleStatus !== SubscriptionPlanStatus.PUBLISHED) {
      throw new BadRequestException({
        code: ErrorCodes.VAL_INVALID_FORMAT,
        message: 'Only published plans can be unpublished',
      });
    }
    return this.prisma.subscriptionPlan.update({
      where: { id: plan.id },
      data: { lifecycleStatus: SubscriptionPlanStatus.UNPUBLISHED },
    });
  }

  async archive(planId: string) {
    const plan = await this.requireActive(planId);
    return this.prisma.subscriptionPlan.update({
      where: { id: plan.id },
      data: {
        archivedAt: new Date(),
        lifecycleStatus: SubscriptionPlanStatus.ARCHIVED,
      },
    });
  }

  async restore(planId: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: planId },
    });
    if (!plan) {
      throw new NotFoundException({
        code: ErrorCodes.RES_NOT_FOUND,
        message: 'Subscription plan not found',
      });
    }
    if (plan.deletedAt == null && plan.archivedAt == null) {
      throw new BadRequestException({
        code: ErrorCodes.VAL_UNKNOWN_FIELD,
        message: 'Subscription plan is not archived or soft-deleted',
      });
    }
    return this.prisma.subscriptionPlan.update({
      where: { id: plan.id },
      data: {
        deletedAt: null,
        archivedAt: null,
        lifecycleStatus:
          plan.lifecycleStatus === SubscriptionPlanStatus.ARCHIVED
            ? SubscriptionPlanStatus.UNPUBLISHED
            : plan.lifecycleStatus,
      },
    });
  }

  private async requireActive(planId: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: planId },
    });
    if (!plan || plan.deletedAt != null) {
      throw new NotFoundException({
        code: ErrorCodes.RES_NOT_FOUND,
        message: 'Subscription plan not found',
      });
    }
    return plan;
  }

  private assertBindingsShape(
    bindings: PlanProductBinding[],
    options: { allowEmpty: boolean },
  ) {
    if (bindings.length === 0) {
      if (options.allowEmpty) return;
      throw new BadRequestException({
        code: ErrorCodes.SUB_PLAN_NOT_BINDABLE,
        message: 'Subscription plan has no product/variant bindings',
      });
    }
    this.snapshots.parsePlanBindings(bindings);
  }

  private async assertBindingsBindable(raw: unknown) {
    const bindings = this.snapshots.parsePlanBindings(raw);
    for (const binding of bindings) {
      const variant = await this.prisma.productVariant.findUnique({
        where: { id: binding.variantId },
        include: { product: true },
      });
      if (
        !variant ||
        variant.deletedAt != null ||
        !variant.product ||
        variant.product.deletedAt != null ||
        variant.productId !== binding.productId
      ) {
        throw new BadRequestException({
          code: ErrorCodes.SUB_PLAN_NOT_BINDABLE,
          message: `Invalid product/variant binding: ${binding.variantId}`,
        });
      }
    }
  }

  private buildListWhere(
    params: ListSubscriptionPlansInput,
  ): Prisma.SubscriptionPlanWhereInput {
    const archivedFilter =
      params.archived === 'ARCHIVED'
        ? { archivedAt: { not: null } }
        : params.archived === 'ALL'
          ? {}
          : params.archived === 'ACTIVE'
            ? { archivedAt: null }
            : {};

    return {
      ...(params.includeDeleted === true ? {} : { deletedAt: null }),
      ...archivedFilter,
      ...(params.lifecycleStatus && params.lifecycleStatus !== 'ALL'
        ? { lifecycleStatus: params.lifecycleStatus }
        : {}),
      ...(params.q
        ? {
            OR: [
              { name: { contains: params.q, mode: 'insensitive' } },
              { slug: { contains: params.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  private async countByStatus(params: ListSubscriptionPlansInput) {
    const where = this.buildListWhere({
      ...params,
      lifecycleStatus: 'ALL',
      q: undefined,
    });
    const rows = await this.prisma.subscriptionPlan.groupBy({
      by: ['lifecycleStatus'],
      where,
      _count: { _all: true },
    });
    const counts: Record<string, number> = { ALL: 0 };
    for (const status of Object.values(SubscriptionPlanStatus)) {
      counts[status] = 0;
    }
    for (const row of rows) {
      counts[row.lifecycleStatus] = row._count._all;
      counts.ALL += row._count._all;
    }
    return counts;
  }

  private slugify(value: string): string {
    const slug = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return slug || 'plan';
  }

  private rethrowSlugConflict(error: unknown): void {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException({
        code: ErrorCodes.VAL_INVALID_FORMAT,
        message: 'Subscription plan slug already exists',
      });
    }
  }
}
