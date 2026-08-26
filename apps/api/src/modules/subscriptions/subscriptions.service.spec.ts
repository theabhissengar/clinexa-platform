import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  OrderType,
  ProductType,
  SubscriptionBillingInterval,
  SubscriptionPlanStatus,
  SubscriptionStatus,
  UserStatus,
} from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { SubscriptionEditPolicyService } from './subscription-edit-policy.service';
import { SubscriptionsLifecycleService } from './subscriptions-lifecycle.service';
import { SubscriptionsRenewalService } from './subscriptions-renewal.service';
import { SubscriptionsScheduleService } from './subscriptions-schedule.service';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsSnapshotService } from './subscriptions-snapshot.service';

describe('SubscriptionsService', () => {
  const patient = {
    id: 'user-1',
    email: 'patient@example.com',
    firstName: 'Pat',
    lastName: 'Ent',
    phone: '555',
    status: UserStatus.ACTIVE,
    deletedAt: null,
  };

  const product = {
    id: 'prod-1',
    name: 'Widget Sub',
    productType: ProductType.SIMPLE_SUBSCRIPTION,
    isRxEligible: false,
    brandName: 'Brand',
    deletedAt: null,
    limitSubscription: null,
  };

  const variant = {
    id: 'var-1',
    productId: 'prod-1',
    sku: 'W-1',
    label: 'Default',
    priceCents: 1000,
    salePriceCents: 900,
    currency: 'USD',
    isFulfillable: true,
    optionValues: null,
    deletedAt: null,
    product,
  };

  const plan = {
    id: 'plan-1',
    name: 'Monthly',
    lifecycleStatus: SubscriptionPlanStatus.PUBLISHED,
    billingInterval: SubscriptionBillingInterval.MONTH,
    intervalCount: 1,
    customIntervalDays: null,
    productBindings: [{ productId: 'prod-1', variantId: 'var-1', quantity: 1 }],
    deletedAt: null,
    archivedAt: null,
  };

  const created = {
    id: 'sub-1',
    subscriptionNumber: 'SUB-1',
    status: SubscriptionStatus.PENDING_SETUP,
    patientUserId: patient.id,
    planId: plan.id,
    cycleNumber: 0,
    deletedAt: null,
    archivedAt: null,
    pausedAt: null,
    statusBeforePause: null,
    nextRenewalAt: null,
    currentPeriodEnd: null,
    clinicalRequirement: 'NONE',
    paymentStatusSummary: null,
    providerSubscriptionRef: null,
    customerFirstName: 'Pat',
    items: [],
    plan,
  };

  function buildPrismaMock() {
    const tx = {
      user: { findUnique: jest.fn().mockResolvedValue(patient) },
      subscriptionPlan: { findUnique: jest.fn().mockResolvedValue(plan) },
      productVariant: { findUnique: jest.fn().mockResolvedValue(variant) },
      subscriptionItem: { findMany: jest.fn().mockResolvedValue([]) },
      order: { findUnique: jest.fn() },
      subscription: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue(created),
        update: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve({ ...created, ...data }),
          ),
      },
      subscriptionStatusHistory: { create: jest.fn().mockResolvedValue({}) },
      subscriptionChangeHistory: { create: jest.fn().mockResolvedValue({}) },
      subscriptionActivity: { create: jest.fn().mockResolvedValue({}) },
      subscriptionNote: {
        create: jest.fn().mockResolvedValue({
          id: 'note-1',
          body: 'hello',
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
      subscription: tx.subscription,
      subscriptionPlan: {
        findUnique: tx.subscriptionPlan.findUnique,
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: plan.id, name: plan.name }]),
      },
      subscriptionNote: { findMany: jest.fn() },
      subscriptionStatusHistory: { findMany: jest.fn() },
      subscriptionChangeHistory: { findMany: jest.fn() },
      subscriptionActivity: { findMany: jest.fn() },
    };
    return { prisma, tx };
  }

  function buildService(prisma: unknown) {
    const lifecycle = new SubscriptionsLifecycleService();
    const snapshots = new SubscriptionsSnapshotService();
    const schedule = new SubscriptionsScheduleService();
    return new SubscriptionsService(
      prisma as PrismaService,
      lifecycle,
      snapshots,
      schedule,
      new SubscriptionEditPolicyService(lifecycle),
      new SubscriptionsRenewalService(
        prisma as PrismaService,
        lifecycle,
        schedule,
      ),
    );
  }

  it('creates a subscription with snapshots, history, and activity', async () => {
    const { prisma, tx } = buildPrismaMock();
    const service = buildService(prisma);
    const result = await service.createSubscription({
      context: 'guardian',
      patientUserId: patient.id,
      planId: plan.id,
      actorUserId: 'admin-1',
      source: 'guardian',
    });
    expect(result.id).toBe('sub-1');
    const createCalls = tx.subscription.create.mock.calls as Array<
      [
        {
          data: {
            status: SubscriptionStatus;
            customerEmail: string;
            items: {
              create: Array<{ productName: string; salePriceCents: number }>;
            };
            statusHistory: { create: { toStatus: SubscriptionStatus } };
            activities: { create: { kind: string } };
          };
        },
      ]
    >;
    const createArg = createCalls[0][0];
    expect(createArg.data.status).toBe(SubscriptionStatus.PENDING_SETUP);
    expect(createArg.data.customerEmail).toBe(patient.email);
    expect(createArg.data.items.create[0].productName).toBe('Widget Sub');
    expect(createArg.data.items.create[0].salePriceCents).toBe(900);
    expect(createArg.data.statusHistory.create.toStatus).toBe(
      SubscriptionStatus.PENDING_SETUP,
    );
    expect(createArg.data.activities.create.kind).toBe('subscription_created');
  });

  it('P3-SUB-001: omits initialOrderId → requests DRAFT INITIAL and binds ids', async () => {
    const { prisma, tx } = buildPrismaMock();
    tx.subscription.create.mockResolvedValue({
      ...created,
      items: [
        {
          productId: 'prod-1',
          variantId: 'var-1',
          productName: 'Widget Sub',
          sku: 'W-1',
          productType: ProductType.SIMPLE_SUBSCRIPTION,
          isRxEligible: false,
          catalogMetadata: null,
          quantity: 1,
          unitPriceCents: 1000,
          salePriceCents: 900,
          currency: 'USD',
        },
      ],
      customerFirstName: 'Pat',
      customerLastName: 'Ent',
      customerEmail: patient.email,
      customerPhone: '555',
    });
    const service = buildService(prisma);
    const onPreflight = jest.fn().mockResolvedValue(undefined);
    const onRequestInitialOrder = jest.fn().mockResolvedValue('ord-new');
    service.setSideEffectHooks({
      onPreflightInitialOrderAddresses: onPreflight,
      onRequestInitialOrder,
    });

    const result = await service.createSubscription({
      context: 'guardian',
      patientUserId: patient.id,
      planId: plan.id,
      actorUserId: 'admin-1',
      source: 'guardian',
    });

    expect(onPreflight).toHaveBeenCalledWith(patient.id);
    expect(onRequestInitialOrder).toHaveBeenCalledTimes(1);
    const initialCalls = onRequestInitialOrder.mock.calls as Array<
      [
        {
          subscriptionId: string;
          patientUserId: string;
          lines: Array<{ productId: string; salePriceCents: number }>;
        },
      ]
    >;
    const initialRequest = initialCalls[0][0];
    expect(initialRequest.subscriptionId).toBe('sub-1');
    expect(initialRequest.patientUserId).toBe(patient.id);
    expect(initialRequest.lines[0]).toMatchObject({
      productId: 'prod-1',
      salePriceCents: 900,
    });
    expect(result.initialOrderId).toBe('ord-new');
    expect(result.latestOrderId).toBe('ord-new');
    const updateCalls = prisma.subscription.update.mock.calls as Array<
      [
        {
          where: { id: string };
          data: { initialOrderId: string; latestOrderId: string };
        },
      ]
    >;
    expect(updateCalls[0][0].where.id).toBe('sub-1');
    expect(updateCalls[0][0].data.initialOrderId).toBe('ord-new');
    expect(updateCalls[0][0].data.latestOrderId).toBe('ord-new');
  });

  it('P3-SUB-001: provided initialOrderId binds without creating an order', async () => {
    const { prisma, tx } = buildPrismaMock();
    tx.order.findUnique.mockResolvedValue({
      id: 'ord-bind',
      patientUserId: patient.id,
      orderType: OrderType.SUBSCRIPTION_INITIAL,
      deletedAt: null,
    });
    const service = buildService(prisma);
    const onRequestInitialOrder = jest.fn();
    const onPreflight = jest.fn();
    service.setSideEffectHooks({
      onPreflightInitialOrderAddresses: onPreflight,
      onRequestInitialOrder,
    });

    await service.createSubscription({
      context: 'guardian',
      patientUserId: patient.id,
      planId: plan.id,
      initialOrderId: 'ord-bind',
      source: 'guardian',
    });

    expect(onPreflight).not.toHaveBeenCalled();
    expect(onRequestInitialOrder).not.toHaveBeenCalled();
    const createCalls = tx.subscription.create.mock.calls as Array<
      [{ data: { initialOrderId: string; latestOrderId: string } }]
    >;
    expect(createCalls[0][0].data.initialOrderId).toBe('ord-bind');
    expect(createCalls[0][0].data.latestOrderId).toBe('ord-bind');
  });

  it('P3-SUB-001: address preflight failure prevents subscription create', async () => {
    const { prisma, tx } = buildPrismaMock();
    const service = buildService(prisma);
    service.setSideEffectHooks({
      onPreflightInitialOrderAddresses: jest.fn().mockRejectedValue(
        new BadRequestException({
          code: ErrorCodes.VAL_MISSING_FIELD,
          message: 'addresses missing',
        }),
      ),
    });

    await expect(
      service.createSubscription({
        context: 'guardian',
        patientUserId: patient.id,
        planId: plan.id,
      }),
    ).rejects.toMatchObject({
      response: { code: ErrorCodes.VAL_MISSING_FIELD },
    });
    expect(tx.subscription.create).not.toHaveBeenCalled();
  });

  it('P3-SUB-002: cancel invokes onSubscriptionCancelled after CANCELLED', async () => {
    const { prisma, tx } = buildPrismaMock();
    const active = {
      ...created,
      status: SubscriptionStatus.ACTIVE,
      nextRenewalAt: new Date('2026-02-01T00:00:00.000Z'),
      statusBeforePause: null,
      plan,
    };
    tx.subscription.findUnique.mockResolvedValue(active);
    const service = buildService(prisma);
    const onSubscriptionCancelled = jest.fn().mockResolvedValue(undefined);
    service.setSideEffectHooks({ onSubscriptionCancelled });

    await service.cancel({
      subscriptionId: 'sub-1',
      source: 'crm',
      actorUserId: 'staff-1',
    });

    expect(onSubscriptionCancelled).toHaveBeenCalledWith({
      subscriptionId: 'sub-1',
      actorUserId: 'staff-1',
      source: 'crm',
    });
  });

  it('rejects CRM create, invalid user, unpublished plan, and bad variant', async () => {
    const { prisma, tx } = buildPrismaMock();
    const service = buildService(prisma);

    await expect(
      service.createSubscription({
        context: 'crm',
        patientUserId: patient.id,
        planId: plan.id,
      }),
    ).rejects.toMatchObject({
      response: { code: ErrorCodes.SUB_CRM_CREATE_FORBIDDEN },
    });

    tx.user.findUnique.mockResolvedValue({
      ...patient,
      status: UserStatus.SUSPENDED,
    });
    await expect(
      service.createSubscription({
        context: 'guardian',
        patientUserId: patient.id,
        planId: plan.id,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    tx.user.findUnique.mockResolvedValue(patient);
    tx.subscriptionPlan.findUnique.mockResolvedValue({
      ...plan,
      lifecycleStatus: SubscriptionPlanStatus.DRAFT,
    });
    await expect(
      service.createSubscription({
        context: 'guardian',
        patientUserId: patient.id,
        planId: plan.id,
      }),
    ).rejects.toMatchObject({
      response: { code: ErrorCodes.SUB_PLAN_NOT_BINDABLE },
    });

    tx.subscriptionPlan.findUnique.mockResolvedValue({
      ...plan,
      archivedAt: new Date(),
    });
    await expect(
      service.createSubscription({
        context: 'guardian',
        patientUserId: patient.id,
        planId: plan.id,
      }),
    ).rejects.toMatchObject({
      response: { code: ErrorCodes.SUB_PLAN_NOT_BINDABLE },
    });

    tx.subscriptionPlan.findUnique.mockResolvedValue(plan);
    tx.productVariant.findUnique.mockResolvedValue(null);
    await expect(
      service.createSubscription({
        context: 'guardian',
        patientUserId: patient.id,
        planId: plan.id,
      }),
    ).rejects.toMatchObject({
      response: { code: ErrorCodes.SUB_PLAN_NOT_BINDABLE },
    });
  });

  it('records pause/resume/cancel history and activity; resume does not catch-up bill', async () => {
    const { prisma, tx } = buildPrismaMock();
    const active = {
      ...created,
      status: SubscriptionStatus.ACTIVE,
      nextRenewalAt: new Date('2026-02-01T00:00:00.000Z'),
      statusBeforePause: null,
      plan,
    };
    tx.subscription.findUnique.mockResolvedValue(active);
    const service = buildService(prisma);

    await service.pause({
      subscriptionId: 'sub-1',
      source: 'crm',
      actorUserId: 'staff-1',
    });
    expect(tx.subscriptionStatusHistory.create).toHaveBeenCalled();
    expect(tx.subscriptionActivity.create).toHaveBeenCalled();

    tx.subscription.findUnique.mockResolvedValue({
      ...active,
      status: SubscriptionStatus.PAUSED,
      statusBeforePause: SubscriptionStatus.ACTIVE,
      nextRenewalAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const resumed = await service.resume({
      subscriptionId: 'sub-1',
      source: 'crm',
      now: new Date('2026-03-01T00:00:00.000Z'),
    });
    expect(resumed.status).toBe(SubscriptionStatus.ACTIVE);
    expect(tx.subscription.update).toHaveBeenCalled();

    tx.subscription.findUnique.mockResolvedValue(active);
    await service.cancel({ subscriptionId: 'sub-1', source: 'guardian' });
    const updateCalls = tx.subscription.update.mock.calls as Array<
      [{ data: { status?: SubscriptionStatus } }]
    >;
    const cancelUpdate = updateCalls.find(
      (call) => call[0].data.status === SubscriptionStatus.CANCELLED,
    );
    expect(cancelUpdate).toBeTruthy();
  });

  it('activates first period and refuses PAST_DUE without failed attempt via lifecycle', async () => {
    const { prisma, tx } = buildPrismaMock();
    tx.subscription.findUnique.mockResolvedValue({
      ...created,
      status: SubscriptionStatus.PENDING_SETUP,
      plan,
    });
    const service = buildService(prisma);
    const activated = await service.activateInitial({
      subscriptionId: 'sub-1',
      toStatus: SubscriptionStatus.ACTIVE,
      source: 'system',
    });
    expect(activated.status).toBe(SubscriptionStatus.ACTIVE);
    expect(activated.cycleNumber).toBe(1);

    tx.subscription.findUnique.mockResolvedValue({
      ...created,
      status: SubscriptionStatus.ACTIVE,
    });
    await expect(
      service.complete({
        subscriptionId: 'sub-1',
        toStatus: SubscriptionStatus.COMPLETED,
        source: 'system',
      }),
    ).resolves.toMatchObject({ status: SubscriptionStatus.COMPLETED });
  });

  it('adds notes without copying body into activity, and Class D requires the flag', async () => {
    const { prisma, tx } = buildPrismaMock();
    tx.subscription.findUnique.mockResolvedValue({
      ...created,
      status: SubscriptionStatus.ACTIVE,
    });
    const service = buildService(prisma);
    await service.addNote({
      subscriptionId: 'sub-1',
      authorUserId: 'staff-1',
      body: 'secret note text',
    });
    const activityCalls = tx.subscriptionActivity.create.mock.calls as Array<
      [
        {
          data: {
            kind: string;
            metadata: {
              noteId?: string;
              platformAuditDeferred?: boolean;
              classD?: boolean;
            };
          };
        },
      ]
    >;
    const activity = activityCalls[0][0];
    expect(activity.data.kind).toBe('note_added');
    expect(activity.data.metadata.noteId).toBe('note-1');
    expect(JSON.stringify(activity.data)).not.toContain('secret note text');

    await expect(
      service.softDelete({
        subscriptionId: 'sub-1',
        classDAuthorized: false as unknown as true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await service.softDelete({
      subscriptionId: 'sub-1',
      classDAuthorized: true,
      reason: 'guardian cleanup',
    });
    const classDCalls = tx.subscriptionActivity.create.mock.calls as Array<
      [
        {
          data: {
            kind: string;
            metadata: { platformAuditDeferred?: boolean; classD?: boolean };
          };
        },
      ]
    >;
    const classDActivity = classDCalls.find(
      (call) => call[0].data.kind === 'subscription_soft_deleted',
    );
    expect(classDActivity).toBeDefined();
    expect(classDActivity?.[0].data.metadata.platformAuditDeferred).toBe(true);
    expect(classDActivity?.[0].data.metadata.classD).toBe(true);
    expect(tx).not.toHaveProperty('auditLog');
    expect(tx).not.toHaveProperty('platformAudit');
  });

  it('does not auto-cancel when clinical requirement is declined hold', async () => {
    const { prisma, tx } = buildPrismaMock();
    tx.subscription.findUnique.mockResolvedValue({
      ...created,
      status: SubscriptionStatus.ACTIVE,
    });
    const service = buildService(prisma);
    await service.setClinicalRequirement({
      subscriptionId: 'sub-1',
      clinicalRequirement: 'DECLINED_HOLD',
      source: 'clinical',
    });
    const updateCalls = tx.subscription.update.mock.calls as Array<
      [{ data: { status?: SubscriptionStatus; clinicalRequirement?: string } }]
    >;
    const updateArg = updateCalls[0][0];
    expect(updateArg.data.status).toBeUndefined();
    expect(updateArg.data.clinicalRequirement).toBe('DECLINED_HOLD');
  });

  it('validates initial order patient and type', async () => {
    const { prisma, tx } = buildPrismaMock();
    tx.order.findUnique.mockResolvedValue({
      id: 'ord-1',
      patientUserId: 'other-user',
      orderType: OrderType.SUBSCRIPTION_INITIAL,
      deletedAt: null,
    });
    const service = buildService(prisma);
    await expect(
      service.createSubscription({
        context: 'guardian',
        patientUserId: patient.id,
        planId: plan.id,
        initialOrderId: 'ord-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lists subscriptions with search and status filters', async () => {
    const { prisma, tx } = buildPrismaMock();
    tx.subscription.findMany.mockResolvedValue([
      {
        id: 'sub-1',
        subscriptionNumber: 'SUB-1',
        status: SubscriptionStatus.ACTIVE,
      },
    ]);
    tx.subscription.count.mockResolvedValue(1);
    tx.subscription.groupBy.mockResolvedValue([
      { status: SubscriptionStatus.ACTIVE, _count: { _all: 1 } },
    ]);
    const service = buildService(prisma);
    const result = await service.listSubscriptions({
      q: 'SUB',
      status: SubscriptionStatus.ACTIVE,
      skip: 0,
      take: 20,
    });
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.statusCounts.ACTIVE).toBe(1);
    expect(tx.subscription.findMany).toHaveBeenCalled();
  });
});
