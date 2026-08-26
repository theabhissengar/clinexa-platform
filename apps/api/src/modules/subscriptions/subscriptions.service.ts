import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import {
  OrderType,
  Prisma,
  SubscriptionPlanStatus,
  SubscriptionStatus,
  UserStatus,
  type Subscription,
  type SubscriptionPlan,
} from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type {
  AddSubscriptionNoteInput,
  CancelSubscriptionInput,
  ClassDSubscriptionInput,
  CorrectSubscriptionInput,
  CreateSubscriptionInput,
  ListSubscriptionsInput,
  OpenRenewalAttemptInput,
  AttachRenewalOrderInput,
  OverrideSubscriptionInput,
  PauseSubscriptionInput,
  RecordPaymentSnapshotInput,
  ResumeSubscriptionInput,
  SetClinicalRequirementInput,
  TransitionSubscriptionInput,
  UpdateSubscriptionFieldsInput,
} from './subscription.types';
import { SubscriptionEditPolicyService } from './subscription-edit-policy.service';
import {
  NOOP_SUBSCRIPTION_SIDE_EFFECTS,
  type SubscriptionNotificationEvent,
  type SubscriptionSideEffectHooks,
} from './subscription-side-effects';
import { SubscriptionsLifecycleService } from './subscriptions-lifecycle.service';
import { SubscriptionsRenewalService } from './subscriptions-renewal.service';
import { SubscriptionsScheduleService } from './subscriptions-schedule.service';
import { SubscriptionsSnapshotService } from './subscriptions-snapshot.service';

type Tx = Prisma.TransactionClient;

@Injectable()
export class SubscriptionsService {
  private sideEffects: SubscriptionSideEffectHooks =
    NOOP_SUBSCRIPTION_SIDE_EFFECTS;

  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: SubscriptionsLifecycleService,
    private readonly snapshots: SubscriptionsSnapshotService,
    private readonly schedule: SubscriptionsScheduleService,
    private readonly editPolicy: SubscriptionEditPolicyService,
    private readonly renewal: SubscriptionsRenewalService,
  ) {}

  setSideEffectHooks(hooks: SubscriptionSideEffectHooks): void {
    this.sideEffects = hooks;
    this.renewal.setSideEffectHooks(hooks);
  }

  openRenewalAttempt(input: OpenRenewalAttemptInput) {
    return this.renewal.openRenewalAttempt(input);
  }

  attachRenewalOrder(input: AttachRenewalOrderInput) {
    return this.renewal.attachRenewalOrder(input);
  }

  isAutoDue(
    subscription: Parameters<SubscriptionsRenewalService['isAutoDue']>[0],
    now: Date,
  ) {
    return this.renewal.isAutoDue(subscription, now);
  }

  async listSubscriptions(params: ListSubscriptionsInput) {
    const skip = params.skip ?? 0;
    const take = Math.min(params.take ?? 50, 100);
    const where = this.buildListWhere(params);

    const [items, total, statusCounts, plans] = await Promise.all([
      this.prisma.subscription.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          subscriptionNumber: true,
          status: true,
          patientUserId: true,
          customerFirstName: true,
          customerLastName: true,
          customerEmail: true,
          customerPhone: true,
          planId: true,
          cycleNumber: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          nextRenewalAt: true,
          paymentStatusSummary: true,
          clinicalRequirement: true,
          initialOrderId: true,
          latestOrderId: true,
          archivedAt: true,
          deletedAt: true,
          createdAt: true,
          updatedAt: true,
          plan: {
            select: {
              id: true,
              name: true,
              billingInterval: true,
              intervalCount: true,
            },
          },
        },
      }),
      this.prisma.subscription.count({ where }),
      this.countByStatus(params),
      this.prisma.subscriptionPlan.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, lifecycleStatus: true },
        orderBy: { name: 'asc' },
        take: 100,
      }),
    ]);

    return { items, total, statusCounts, plans };
  }

  async getById(
    subscriptionId: string,
    options?: { includeDeleted?: boolean },
  ) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: {
        items: { orderBy: { createdAt: 'asc' } },
        plan: true,
        patient: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            displayName: true,
            phone: true,
            status: true,
          },
        },
        initialOrder: {
          select: { id: true, orderNumber: true, status: true },
        },
        latestOrder: {
          select: { id: true, orderNumber: true, status: true },
        },
      },
    });
    if (
      !subscription ||
      (subscription.deletedAt != null && options?.includeDeleted !== true)
    ) {
      throw new NotFoundException({
        code: ErrorCodes.RES_NOT_FOUND,
        message: 'Subscription not found',
      });
    }
    return {
      ...subscription,
      allowedNextStatuses: this.lifecycle.allowedNext(subscription.status),
      canCancel: this.lifecycle.isCancellable(subscription.status),
      canPause: this.lifecycle.isPausable(subscription.status),
      canResume: subscription.status === SubscriptionStatus.PAUSED,
    };
  }

  async listRenewalAttempts(subscriptionId: string) {
    await this.requireExisting(this.prisma, subscriptionId);
    return this.prisma.subscriptionRenewalAttempt.findMany({
      where: { subscriptionId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async retryRenewalAttempt(input: {
    subscriptionId: string;
    attemptId: string;
    actorUserId?: string | null;
    source: string;
  }) {
    const subscription = await this.requireActive(
      this.prisma,
      input.subscriptionId,
    );
    const attempt = await this.prisma.subscriptionRenewalAttempt.findUnique({
      where: { id: input.attemptId },
    });
    if (!attempt || attempt.subscriptionId !== input.subscriptionId) {
      throw new NotFoundException({
        code: ErrorCodes.RES_NOT_FOUND,
        message: 'Renewal attempt not found',
      });
    }
    const currentKey = this.renewal.currentBillingPeriodKey(
      subscription.id,
      subscription.currentPeriodEnd,
    );
    if (attempt.billingPeriodKey !== currentKey) {
      throw new BadRequestException({
        code: ErrorCodes.SUB_DUPLICATE_PERIOD,
        message: 'Retry must target the current billing period attempt',
      });
    }
    return this.renewal.openRenewalAttempt({
      subscriptionId: input.subscriptionId,
      mode: 'retry',
      actorUserId: input.actorUserId ?? null,
      source: input.source,
    });
  }

  async createSubscription(input: CreateSubscriptionInput) {
    if (input.context === 'crm') {
      throw new BadRequestException({
        code: ErrorCodes.SUB_CRM_CREATE_FORBIDDEN,
        message: 'CRM cannot create subscriptions in V1',
      });
    }

    const source = input.source ?? input.context;
    const shouldCreateInitialOrder =
      input.initialOrderId == null || input.initialOrderId === '';

    // P3-SUB-001: fail closed on addresses before insert when auto-creating.
    if (
      shouldCreateInitialOrder &&
      this.sideEffects.onPreflightInitialOrderAddresses
    ) {
      await this.sideEffects.onPreflightInitialOrderAddresses(
        input.patientUserId,
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: input.patientUserId },
      });
      if (
        !user ||
        user.deletedAt != null ||
        user.status !== UserStatus.ACTIVE
      ) {
        throw new NotFoundException({
          code: ErrorCodes.RES_NOT_FOUND,
          message: 'Patient user not found or not eligible',
        });
      }

      const plan = await tx.subscriptionPlan.findUnique({
        where: { id: input.planId },
      });
      this.assertPlanBindable(plan);

      this.schedule.assertIntervalConfig({
        billingInterval: plan.billingInterval,
        intervalCount: plan.intervalCount,
        customIntervalDays: plan.customIntervalDays,
      });

      const bindings = this.snapshots.parsePlanBindings(plan.productBindings);
      const itemSnapshots = [];

      for (const binding of bindings) {
        const variant = await tx.productVariant.findUnique({
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

        await this.assertLimitSubscription(tx, user.id, variant.product);

        itemSnapshots.push(
          this.snapshots.snapshotCatalogLine(
            variant.product,
            variant,
            binding.quantity,
          ),
        );
      }

      if (input.initialOrderId) {
        await this.assertInitialOrder(tx, input.initialOrderId, user.id);
      }

      const customer = this.snapshots.snapshotCustomer(user, input.customer);
      const subscriptionNumber = await this.allocateSubscriptionNumber(tx);

      return tx.subscription.create({
        data: {
          subscriptionNumber,
          patientUserId: user.id,
          planId: plan.id,
          status: SubscriptionStatus.PENDING_SETUP,
          cycleNumber: 0,
          ...customer,
          paymentMethodId: input.opaquePayment?.paymentMethodId ?? null,
          providerCustomerRef: input.opaquePayment?.providerCustomerRef ?? null,
          providerSubscriptionRef:
            input.opaquePayment?.providerSubscriptionRef ?? null,
          initialOrderId: input.initialOrderId ?? null,
          latestOrderId: input.initialOrderId ?? null,
          endsAt: input.endsAt ?? null,
          shippingPreferenceNotes: input.shippingPreferenceNotes ?? null,
          items: {
            create: itemSnapshots.map((snap) => ({
              productId: snap.productId,
              variantId: snap.variantId,
              productName: snap.productName,
              sku: snap.sku,
              productType: snap.productType,
              isRxEligible: snap.isRxEligible,
              catalogMetadata: snap.catalogMetadata as Prisma.InputJsonValue,
              quantity: snap.quantity,
              unitPriceCents: snap.unitPriceCents,
              salePriceCents: snap.salePriceCents,
              currency: snap.currency,
            })),
          },
          statusHistory: {
            create: {
              fromStatus: null,
              toStatus: SubscriptionStatus.PENDING_SETUP,
              actorUserId: input.actorUserId ?? null,
              source,
              reason: 'subscription_created',
            },
          },
          activities: {
            create: {
              actorUserId: input.actorUserId ?? null,
              kind: 'subscription_created',
              summary: `Subscription ${subscriptionNumber} created`,
              metadata: {
                planId: plan.id,
                itemCount: itemSnapshots.length,
                context: input.context,
              },
            },
          },
        },
        include: { items: true, plan: true },
      });
    });

    // P3-SUB-001: when bind omitted, request SUBSCRIPTION_INITIAL DRAFT via composition.
    if (shouldCreateInitialOrder && this.sideEffects.onRequestInitialOrder) {
      const orderId = await this.sideEffects.onRequestInitialOrder({
        subscriptionId: created.id,
        patientUserId: created.patientUserId,
        actorUserId: input.actorUserId ?? null,
        source,
        customer: {
          firstName: created.customerFirstName,
          lastName: created.customerLastName,
          email: created.customerEmail,
          phone: created.customerPhone,
        },
        lines: created.items.map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          productName: item.productName,
          sku: item.sku,
          productType: item.productType,
          isRxEligible: item.isRxEligible,
          catalogMetadata: item.catalogMetadata,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          salePriceCents: item.salePriceCents,
          currency: item.currency,
        })),
      });
      if (orderId) {
        return this.prisma.subscription.update({
          where: { id: created.id },
          data: {
            initialOrderId: orderId,
            latestOrderId: orderId,
            activities: {
              create: {
                actorUserId: input.actorUserId ?? null,
                kind: 'initial_order_bound',
                summary: `Initial order ${orderId} created and bound`,
                metadata: { orderId, source },
              },
            },
          },
          include: { items: true, plan: true },
        });
      }
    }

    return created;
  }

  async pause(input: PauseSubscriptionInput) {
    return this.transitionWithSideEffects(async (tx) => {
      const sub = await this.requireActive(tx, input.subscriptionId);
      this.lifecycle.assertPausable(sub.status);
      this.lifecycle.assertTransition(sub.status, SubscriptionStatus.PAUSED);
      return this.applyLifecycle(tx, sub, SubscriptionStatus.PAUSED, {
        actorUserId: input.actorUserId,
        source: input.source,
        reason: input.reason ?? 'paused',
        extraData: {
          pausedAt: new Date(),
          statusBeforePause: sub.status,
        },
        activityKind: 'subscription_paused',
      });
    });
  }

  async resume(input: ResumeSubscriptionInput) {
    const now = input.now ?? new Date();
    return this.transitionWithSideEffects(async (tx) => {
      const sub = await this.requireActive(tx, input.subscriptionId, {
        plan: true,
      });
      this.lifecycle.assertResumable(sub.status);
      const restoreTo = sub.statusBeforePause;
      if (
        restoreTo !== SubscriptionStatus.ACTIVE &&
        restoreTo !== SubscriptionStatus.PAST_DUE
      ) {
        throw new BadRequestException({
          code: ErrorCodes.SUB_PAUSE_RESUME_FORBIDDEN,
          message: 'statusBeforePause is missing or invalid',
        });
      }
      this.lifecycle.assertTransition(sub.status, restoreTo, {
        statusBeforePause: restoreTo,
      });
      const plan = (sub as Subscription & { plan: SubscriptionPlan }).plan;
      const nextRenewalAt = this.schedule.nextRenewalAtOnResume(
        now,
        sub.nextRenewalAt,
        {
          billingInterval: plan.billingInterval,
          intervalCount: plan.intervalCount,
          customIntervalDays: plan.customIntervalDays,
        },
      );
      return this.applyLifecycle(tx, sub, restoreTo, {
        actorUserId: input.actorUserId,
        source: input.source,
        reason: input.reason ?? 'resumed',
        extraData: {
          pausedAt: null,
          nextRenewalAt,
        },
        activityKind: 'subscription_resumed',
      });
    });
  }

  async cancel(input: CancelSubscriptionInput) {
    const { updated: result, prior } = await this.transitionWithSideEffects(
      async (tx) => {
        const sub = await this.requireActive(tx, input.subscriptionId);
        this.lifecycle.assertCancellable(sub.status);
        this.lifecycle.assertTransition(
          sub.status,
          SubscriptionStatus.CANCELLED,
        );
        const updated = await this.applyLifecycle(
          tx,
          sub,
          SubscriptionStatus.CANCELLED,
          {
            actorUserId: input.actorUserId,
            source: input.source,
            reason: input.reason ?? 'cancelled',
            activityKind: 'subscription_cancelled',
          },
        );
        return { updated, prior: sub };
      },
    );

    if (prior.providerSubscriptionRef && this.sideEffects.onPayment) {
      await this.sideEffects.onPayment(
        'cancel_provider_recurring',
        result.id,
        prior.providerSubscriptionRef,
      );
    }
    // P3-SUB-002: cancel open INITIAL/RENEWAL DRAFT|PAYMENT_PENDING orders (composition).
    if (this.sideEffects.onSubscriptionCancelled) {
      await this.sideEffects.onSubscriptionCancelled({
        subscriptionId: result.id,
        actorUserId: input.actorUserId ?? null,
        source: input.source,
      });
    }
    await this.emitNotify('subscription.cancelled', result.id);
    return result;
  }

  async activateInitial(input: TransitionSubscriptionInput) {
    const { updated: result } = await this.transitionWithSideEffects(
      async (tx) => {
        const sub = await this.requireActive(tx, input.subscriptionId, {
          plan: true,
        });
        this.lifecycle.assertTransition(
          sub.status,
          SubscriptionStatus.ACTIVE,
          input,
        );
        if (sub.status !== SubscriptionStatus.PENDING_SETUP) {
          throw new BadRequestException({
            code: ErrorCodes.SUB_INVALID_TRANSITION,
            message: 'activateInitial requires PENDING_SETUP',
          });
        }
        const plan = (sub as Subscription & { plan: SubscriptionPlan }).plan;
        const period = this.schedule.firstPeriod(new Date(), {
          billingInterval: plan.billingInterval,
          intervalCount: plan.intervalCount,
          customIntervalDays: plan.customIntervalDays,
        });
        const updated = await this.applyLifecycle(
          tx,
          sub,
          SubscriptionStatus.ACTIVE,
          {
            actorUserId: input.actorUserId,
            source: input.source,
            reason: input.reason ?? 'initial_setup_complete',
            extraData: { ...period },
            activityKind: 'subscription_activated',
          },
        );
        return { updated };
      },
    );
    await this.emitNotify('subscription.started', result.id);
    return result;
  }

  async markPastDue(input: TransitionSubscriptionInput) {
    const { updated: result } = await this.transitionWithSideEffects(
      async (tx) => {
        const sub = await this.requireActive(tx, input.subscriptionId);
        this.lifecycle.assertTransition(
          sub.status,
          SubscriptionStatus.PAST_DUE,
          {
            failedRenewalAttempt: true,
          },
        );
        const updated = await this.applyLifecycle(
          tx,
          sub,
          SubscriptionStatus.PAST_DUE,
          {
            actorUserId: input.actorUserId,
            source: input.source,
            reason: input.reason ?? 'renewal_payment_failed',
            extraData: { paymentStatusSummary: 'failed' },
            activityKind: 'subscription_past_due',
          },
        );
        return { updated };
      },
    );
    await this.emitNotify('subscription.past_due', result.id);
    return result;
  }

  async recoverActive(input: TransitionSubscriptionInput) {
    const { updated: result } = await this.transitionWithSideEffects(
      async (tx) => {
        const sub = await this.requireActive(tx, input.subscriptionId);
        this.lifecycle.assertTransition(sub.status, SubscriptionStatus.ACTIVE);
        if (sub.status !== SubscriptionStatus.PAST_DUE) {
          throw new BadRequestException({
            code: ErrorCodes.SUB_INVALID_TRANSITION,
            message: 'recoverActive requires PAST_DUE',
          });
        }
        const updated = await this.applyLifecycle(
          tx,
          sub,
          SubscriptionStatus.ACTIVE,
          {
            actorUserId: input.actorUserId,
            source: input.source,
            reason: input.reason ?? 'renewal_payment_recovered',
            extraData: { paymentStatusSummary: 'authorized_or_captured' },
            activityKind: 'subscription_recovered',
          },
        );
        return { updated };
      },
    );
    await this.emitNotify('subscription.renewed', result.id);
    return result;
  }

  async expire(input: TransitionSubscriptionInput) {
    return this.simpleSystemTransition(
      input,
      SubscriptionStatus.EXPIRED,
      'subscription_expired',
    );
  }

  async complete(input: TransitionSubscriptionInput) {
    return this.simpleSystemTransition(
      input,
      SubscriptionStatus.COMPLETED,
      'subscription_completed',
    );
  }

  async updateFields(input: UpdateSubscriptionFieldsInput) {
    return this.prisma.$transaction(async (tx) => {
      const sub = await this.requireActive(tx, input.subscriptionId);
      const data: Prisma.SubscriptionUpdateInput = {};
      const changes: Record<string, { from: unknown; to: unknown }> = {};

      const apply = (
        field:
          | 'shippingPreferenceNotes'
          | 'opsFlags'
          | 'adminTags'
          | 'reconciliationFlags',
        value: unknown,
      ) => {
        this.editPolicy.assertFieldAllowed(input.context, sub.status, field);
        (data as Record<string, unknown>)[field] = value;
        changes[field] = {
          from: (sub as Record<string, unknown>)[field],
          to: value,
        };
      };

      if (input.shippingPreferenceNotes !== undefined) {
        apply('shippingPreferenceNotes', input.shippingPreferenceNotes);
      }
      if (input.opsFlags !== undefined) {
        apply('opsFlags', input.opsFlags);
      }
      if (input.adminTags !== undefined) {
        apply('adminTags', input.adminTags);
      }
      if (input.reconciliationFlags !== undefined) {
        apply('reconciliationFlags', input.reconciliationFlags);
      }

      if (Object.keys(data).length === 0) {
        throw new BadRequestException({
          code: ErrorCodes.VAL_MISSING_FIELD,
          message: 'No editable fields provided',
        });
      }

      const updated = await tx.subscription.update({
        where: { id: sub.id },
        data,
      });
      await tx.subscriptionChangeHistory.create({
        data: {
          subscriptionId: sub.id,
          actorId: input.actorUserId ?? null,
          action: 'fields_updated',
          changes: changes as Prisma.InputJsonValue,
        },
      });
      await tx.subscriptionActivity.create({
        data: {
          subscriptionId: sub.id,
          actorUserId: input.actorUserId ?? null,
          kind: 'subscription_updated',
          summary: 'Subscription fields updated',
          metadata: { context: input.context, fields: Object.keys(changes) },
        },
      });
      return updated;
    });
  }

  async addNote(input: AddSubscriptionNoteInput) {
    const body = input.body?.trim();
    if (!body) {
      throw new BadRequestException({
        code: ErrorCodes.VAL_MISSING_FIELD,
        message: 'Note body is required',
      });
    }
    return this.prisma.$transaction(async (tx) => {
      await this.requireActive(tx, input.subscriptionId);
      const note = await tx.subscriptionNote.create({
        data: {
          subscriptionId: input.subscriptionId,
          authorUserId: input.authorUserId,
          body,
        },
      });
      await tx.subscriptionActivity.create({
        data: {
          subscriptionId: input.subscriptionId,
          actorUserId: input.authorUserId,
          kind: 'note_added',
          summary: 'Internal note added',
          metadata: { noteId: note.id },
        },
      });
      return note;
    });
  }

  async listNotes(subscriptionId: string) {
    await this.requireExisting(this.prisma, subscriptionId);
    return this.prisma.subscriptionNote.findMany({
      where: { subscriptionId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async listStatusHistory(subscriptionId: string) {
    await this.requireExisting(this.prisma, subscriptionId);
    return this.prisma.subscriptionStatusHistory.findMany({
      where: { subscriptionId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async listChangeHistory(subscriptionId: string) {
    await this.requireExisting(this.prisma, subscriptionId);
    return this.prisma.subscriptionChangeHistory.findMany({
      where: { subscriptionId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async listActivity(subscriptionId: string) {
    await this.requireExisting(this.prisma, subscriptionId);
    return this.prisma.subscriptionActivity.findMany({
      where: { subscriptionId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async setClinicalRequirement(input: SetClinicalRequirementInput) {
    return this.prisma.$transaction(async (tx) => {
      const sub = await this.requireActive(tx, input.subscriptionId);
      if (sub.clinicalRequirement === input.clinicalRequirement) {
        return sub;
      }
      const updated = await tx.subscription.update({
        where: { id: sub.id },
        data: { clinicalRequirement: input.clinicalRequirement },
      });
      await tx.subscriptionChangeHistory.create({
        data: {
          subscriptionId: sub.id,
          actorId: input.actorUserId ?? null,
          action: 'clinical_requirement',
          changes: {
            clinicalRequirement: {
              from: sub.clinicalRequirement,
              to: input.clinicalRequirement,
            },
          },
        },
      });
      await tx.subscriptionActivity.create({
        data: {
          subscriptionId: sub.id,
          actorUserId: input.actorUserId ?? null,
          kind: 'clinical_requirement_updated',
          summary: `${sub.clinicalRequirement} → ${input.clinicalRequirement}`,
          metadata: {
            source: input.source,
            reason: input.reason ?? null,
          },
        },
      });
      if (
        input.clinicalRequirement === 'REASSESSMENT_REQUIRED' ||
        input.clinicalRequirement === 'DECLINED_HOLD'
      ) {
        // Lifecycle is intentionally unchanged (SUB-CLIN-001).
      }
      return updated;
    });
  }

  async recordPaymentSnapshot(input: RecordPaymentSnapshotInput) {
    return this.prisma.$transaction(async (tx) => {
      const sub = await this.requireActive(tx, input.subscriptionId);
      const updated = await tx.subscription.update({
        where: { id: sub.id },
        data: {
          paymentStatusSummary: input.paymentStatusSummary,
          latestPaymentId: input.latestPaymentId ?? sub.latestPaymentId,
        },
      });
      await tx.subscriptionActivity.create({
        data: {
          subscriptionId: sub.id,
          actorUserId: input.actorUserId ?? null,
          kind: 'payment_snapshot_recorded',
          summary: `Payment snapshot ${input.paymentStatusSummary}`,
          metadata: {
            source: input.source,
            paymentStatusSummary: input.paymentStatusSummary,
            latestPaymentId: input.latestPaymentId ?? null,
          },
        },
      });
      return updated;
    });
  }

  async overrideStatus(input: OverrideSubscriptionInput) {
    this.assertClassD(input);
    const reason = input.reason?.trim();
    if (!reason) {
      throw new BadRequestException({
        code: ErrorCodes.VAL_MISSING_FIELD,
        message: 'Override requires a non-empty reason',
      });
    }
    return this.prisma.$transaction(async (tx) => {
      const sub = await this.requireActive(tx, input.subscriptionId);
      if (sub.status === input.toStatus) {
        throw new BadRequestException({
          code: ErrorCodes.SUB_INVALID_TRANSITION,
          message: 'Override toStatus must differ from current status',
        });
      }
      const updated = await tx.subscription.update({
        where: { id: sub.id },
        data: { status: input.toStatus },
      });
      await tx.subscriptionStatusHistory.create({
        data: {
          subscriptionId: sub.id,
          fromStatus: sub.status,
          toStatus: input.toStatus,
          actorUserId: input.actorUserId ?? null,
          source: 'guardian_override',
          reason,
          metadata: {
            classD: true,
            override: true,
            platformAuditDeferred: true,
            ...(input.metadata ?? {}),
          },
        },
      });
      await tx.subscriptionActivity.create({
        data: {
          subscriptionId: sub.id,
          actorUserId: input.actorUserId ?? null,
          kind: 'administrative_override',
          summary: `Override ${sub.status} → ${input.toStatus}`,
          metadata: {
            classD: true,
            reason,
            platformAuditDeferred: true,
          },
        },
      });
      return updated;
    });
  }

  async correctCustomerSnapshot(input: CorrectSubscriptionInput) {
    this.assertClassD(input);
    const reason = input.reason?.trim();
    if (!reason) {
      throw new BadRequestException({
        code: ErrorCodes.VAL_MISSING_FIELD,
        message: 'Correction requires a non-empty reason',
      });
    }
    if (!input.customer) {
      throw new BadRequestException({
        code: ErrorCodes.VAL_MISSING_FIELD,
        message: 'Correction requires customer fields',
      });
    }
    return this.prisma.$transaction(async (tx) => {
      const sub = await this.requireActive(tx, input.subscriptionId);
      const data: Prisma.SubscriptionUpdateInput = {};
      const changes: Record<string, unknown> = {};
      if (input.customer?.firstName !== undefined) {
        data.customerFirstName = input.customer.firstName;
        changes.customerFirstName = {
          from: sub.customerFirstName,
          to: input.customer.firstName,
        };
      }
      if (input.customer?.lastName !== undefined) {
        data.customerLastName = input.customer.lastName;
        changes.customerLastName = {
          from: sub.customerLastName,
          to: input.customer.lastName,
        };
      }
      if (input.customer?.email !== undefined) {
        data.customerEmail = input.customer.email;
        changes.customerEmail = {
          from: sub.customerEmail,
          to: input.customer.email,
        };
      }
      if (input.customer?.phone !== undefined) {
        data.customerPhone = input.customer.phone;
        changes.customerPhone = {
          from: sub.customerPhone,
          to: input.customer.phone,
        };
      }
      const updated = await tx.subscription.update({
        where: { id: sub.id },
        data,
      });
      await tx.subscriptionChangeHistory.create({
        data: {
          subscriptionId: sub.id,
          actorId: input.actorUserId ?? null,
          action: 'administrative_correction',
          changes: {
            ...changes,
            classD: true,
            platformAuditDeferred: true,
            reason,
          },
        },
      });
      await tx.subscriptionActivity.create({
        data: {
          subscriptionId: sub.id,
          actorUserId: input.actorUserId ?? null,
          kind: 'administrative_correction',
          summary: 'Customer snapshot corrected',
          metadata: { classD: true, reason, platformAuditDeferred: true },
        },
      });
      return updated;
    });
  }

  async softDelete(input: ClassDSubscriptionInput) {
    this.assertClassD(input);
    return this.classDFlag(
      input,
      { deletedAt: new Date() },
      'subscription_soft_deleted',
    );
  }

  async archive(input: ClassDSubscriptionInput) {
    this.assertClassD(input);
    return this.classDFlag(
      input,
      { archivedAt: new Date() },
      'subscription_archived',
    );
  }

  async restore(input: ClassDSubscriptionInput) {
    this.assertClassD(input);
    return this.prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.findUnique({
        where: { id: input.subscriptionId },
      });
      if (!sub) {
        throw new NotFoundException({
          code: ErrorCodes.RES_NOT_FOUND,
          message: 'Subscription not found',
        });
      }
      if (sub.deletedAt == null && sub.archivedAt == null) {
        throw new BadRequestException({
          code: ErrorCodes.VAL_UNKNOWN_FIELD,
          message: 'Subscription is not archived or soft-deleted',
        });
      }
      const updated = await tx.subscription.update({
        where: { id: sub.id },
        data: { deletedAt: null, archivedAt: null },
      });
      await tx.subscriptionActivity.create({
        data: {
          subscriptionId: sub.id,
          actorUserId: input.actorUserId ?? null,
          kind: 'subscription_restored',
          summary: 'Subscription restored (Class D)',
          metadata: {
            reason: input.reason ?? null,
            classD: true,
            platformAuditDeferred: true,
          },
        },
      });
      return updated;
    });
  }

  private async simpleSystemTransition(
    input: TransitionSubscriptionInput,
    toStatus: SubscriptionStatus,
    activityKind: string,
  ) {
    const { updated: result } = await this.transitionWithSideEffects(
      async (tx) => {
        const sub = await this.requireActive(tx, input.subscriptionId);
        this.lifecycle.assertTransition(sub.status, toStatus);
        const updated = await this.applyLifecycle(tx, sub, toStatus, {
          actorUserId: input.actorUserId,
          source: input.source,
          reason: input.reason ?? toStatus.toLowerCase(),
          activityKind,
        });
        return { updated };
      },
    );
    return result;
  }

  private async applyLifecycle(
    tx: Tx,
    sub: Subscription,
    toStatus: SubscriptionStatus,
    opts: {
      actorUserId?: string | null;
      source: string;
      reason: string;
      extraData?: Prisma.SubscriptionUpdateInput;
      activityKind: string;
    },
  ) {
    const updated = await tx.subscription.update({
      where: { id: sub.id },
      data: {
        status: toStatus,
        ...(opts.extraData ?? {}),
      },
    });
    await tx.subscriptionStatusHistory.create({
      data: {
        subscriptionId: sub.id,
        fromStatus: sub.status,
        toStatus,
        actorUserId: opts.actorUserId ?? null,
        source: opts.source,
        reason: opts.reason,
      },
    });
    await tx.subscriptionActivity.create({
      data: {
        subscriptionId: sub.id,
        actorUserId: opts.actorUserId ?? null,
        kind: opts.activityKind,
        summary: `${sub.status} → ${toStatus}`,
        metadata: { source: opts.source, reason: opts.reason },
      },
    });
    return updated;
  }

  private async transitionWithSideEffects<T>(
    work: (tx: Tx) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(work);
  }

  private assertPlanBindable(
    plan: SubscriptionPlan | null,
  ): asserts plan is SubscriptionPlan {
    if (
      !plan ||
      plan.deletedAt != null ||
      plan.archivedAt != null ||
      plan.lifecycleStatus !== SubscriptionPlanStatus.PUBLISHED
    ) {
      throw new BadRequestException({
        code: ErrorCodes.SUB_PLAN_NOT_BINDABLE,
        message: 'Subscription plan is not published or not bindable',
      });
    }
  }

  private async assertLimitSubscription(
    tx: Tx,
    patientUserId: string,
    product: { id: string; limitSubscription: string | null },
  ) {
    const max = this.snapshots.maxConcurrentForLimit(product.limitSubscription);
    if (max == null) {
      return;
    }
    const existing = await tx.subscriptionItem.findMany({
      where: {
        productId: product.id,
        subscription: {
          patientUserId,
          deletedAt: null,
          status: {
            notIn: [
              SubscriptionStatus.CANCELLED,
              SubscriptionStatus.EXPIRED,
              SubscriptionStatus.COMPLETED,
            ],
          },
        },
      },
      select: { subscriptionId: true },
    });
    const uniqueSubs = new Set(existing.map((row) => row.subscriptionId));
    if (uniqueSubs.size >= max) {
      throw new BadRequestException({
        code: ErrorCodes.SUB_PLAN_NOT_BINDABLE,
        message: `limitSubscription exceeded for product ${product.id}`,
      });
    }
  }

  private async assertInitialOrder(
    tx: Tx,
    orderId: string,
    patientUserId: string,
  ) {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order || order.deletedAt != null) {
      throw new NotFoundException({
        code: ErrorCodes.RES_NOT_FOUND,
        message: 'Initial order not found',
      });
    }
    if (order.patientUserId !== patientUserId) {
      throw new BadRequestException({
        code: ErrorCodes.VAL_INVALID_FORMAT,
        message: 'Initial order patient does not match subscription patient',
      });
    }
    if (
      order.orderType !== OrderType.SUBSCRIPTION_INITIAL &&
      order.orderType !== OrderType.ONE_TIME
    ) {
      throw new BadRequestException({
        code: ErrorCodes.VAL_INVALID_FORMAT,
        message: 'Initial order type is not bindable to a subscription',
      });
    }
  }

  private async classDFlag(
    input: ClassDSubscriptionInput,
    data: Prisma.SubscriptionUpdateInput,
    kind: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const sub = await this.requireActive(tx, input.subscriptionId);
      const updated = await tx.subscription.update({
        where: { id: sub.id },
        data,
      });
      await tx.subscriptionActivity.create({
        data: {
          subscriptionId: sub.id,
          actorUserId: input.actorUserId ?? null,
          kind,
          summary: `${kind} (Class D)`,
          metadata: {
            reason: input.reason ?? null,
            classD: true,
            platformAuditDeferred: true,
          },
        },
      });
      return updated;
    });
  }

  private assertClassD(input: { classDAuthorized: boolean }): void {
    if (!input.classDAuthorized) {
      throw new BadRequestException({
        code: ErrorCodes.AUTHZ_MISSING_PERMISSION,
        message: 'Class D authorization required',
      });
    }
  }

  private async requireExisting(
    tx: Tx | PrismaService,
    subscriptionId: string,
  ) {
    const subscription = await tx.subscription.findUnique({
      where: { id: subscriptionId },
    });
    if (!subscription) {
      throw new NotFoundException({
        code: ErrorCodes.RES_NOT_FOUND,
        message: 'Subscription not found',
      });
    }
    return subscription;
  }

  private async requireActive(
    tx: Tx | PrismaService,
    subscriptionId: string,
    include?: { plan?: boolean },
  ) {
    const subscription = await tx.subscription.findUnique({
      where: { id: subscriptionId },
      include: include?.plan ? { plan: true } : undefined,
    });
    if (!subscription || subscription.deletedAt != null) {
      throw new NotFoundException({
        code: ErrorCodes.RES_NOT_FOUND,
        message: 'Subscription not found',
      });
    }
    return subscription;
  }

  private buildListWhere(
    params: ListSubscriptionsInput,
  ): Prisma.SubscriptionWhereInput {
    const createdAt: Prisma.DateTimeFilter = {};
    if (params.createdFrom) {
      createdAt.gte = new Date(params.createdFrom);
    }
    if (params.createdTo) {
      createdAt.lte = new Date(params.createdTo);
    }

    const nextRenewalAt: Prisma.DateTimeFilter = {};
    if (params.nextRenewalFrom) {
      nextRenewalAt.gte = new Date(params.nextRenewalFrom);
    }
    if (params.nextRenewalTo) {
      nextRenewalAt.lte = new Date(params.nextRenewalTo);
    }

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
      ...(params.status && params.status !== 'ALL'
        ? { status: params.status }
        : {}),
      ...(params.planId ? { planId: params.planId } : {}),
      ...(params.patientUserId ? { patientUserId: params.patientUserId } : {}),
      ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
      ...(Object.keys(nextRenewalAt).length > 0 ? { nextRenewalAt } : {}),
      ...(params.q
        ? {
            OR: [
              {
                subscriptionNumber: {
                  contains: params.q,
                  mode: 'insensitive',
                },
              },
              {
                customerEmail: { contains: params.q, mode: 'insensitive' },
              },
              {
                customerFirstName: {
                  contains: params.q,
                  mode: 'insensitive',
                },
              },
              {
                customerLastName: { contains: params.q, mode: 'insensitive' },
              },
              {
                customerPhone: { contains: params.q, mode: 'insensitive' },
              },
            ],
          }
        : {}),
    };
  }

  private async countByStatus(params: ListSubscriptionsInput) {
    const archivedFilter =
      params.archived === 'ARCHIVED'
        ? { archivedAt: { not: null } }
        : params.archived === 'ALL'
          ? {}
          : params.archived === 'ACTIVE'
            ? { archivedAt: null }
            : {};
    const rows = await this.prisma.subscription.groupBy({
      by: ['status'],
      where: {
        ...(params.includeDeleted === true ? {} : { deletedAt: null }),
        ...archivedFilter,
      },
      _count: { _all: true },
    });
    const counts: Record<string, number> = { ALL: 0 };
    for (const status of Object.values(SubscriptionStatus)) {
      counts[status] = 0;
    }
    for (const row of rows) {
      counts[row.status] = row._count._all;
      counts.ALL += row._count._all;
    }
    return counts;
  }

  async notify(
    event: SubscriptionNotificationEvent,
    subscriptionId: string,
  ): Promise<void> {
    if (this.sideEffects.onNotify) {
      await this.sideEffects.onNotify(event, subscriptionId);
    }
  }

  private async emitNotify(
    event: SubscriptionNotificationEvent,
    subscriptionId: string,
  ) {
    await this.notify(event, subscriptionId);
  }

  private async allocateSubscriptionNumber(tx: Tx): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = `SUB-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString('hex').toUpperCase()}`;
      const existing = await tx.subscription.findUnique({
        where: { subscriptionNumber: candidate },
        select: { id: true },
      });
      if (!existing) {
        return candidate;
      }
    }
    throw new ConflictException({
      code: ErrorCodes.SYS_UNEXPECTED,
      message: 'Unable to allocate unique subscription number',
    });
  }
}
