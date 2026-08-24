import { BadRequestException } from '@nestjs/common';
import { SubscriptionStatus } from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { AdminSubscriptionsController } from './admin-subscriptions.controller';
import type { SubscriptionsService } from './subscriptions.service';

describe('AdminSubscriptionsController', () => {
  const subscriptions = {
    listSubscriptions: jest.fn(),
    getById: jest.fn(),
    createSubscription: jest.fn(),
    updateFields: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    cancel: jest.fn(),
    activateInitial: jest.fn(),
    softDelete: jest.fn(),
    archive: jest.fn(),
    restore: jest.fn(),
    correctCustomerSnapshot: jest.fn(),
    overrideStatus: jest.fn(),
    listNotes: jest.fn(),
    addNote: jest.fn(),
    listStatusHistory: jest.fn(),
    listChangeHistory: jest.fn(),
    listActivity: jest.fn(),
    listRenewalAttempts: jest.fn(),
    openRenewalAttempt: jest.fn(),
    retryRenewalAttempt: jest.fn(),
  };

  const controller = new AdminSubscriptionsController(
    subscriptions as unknown as SubscriptionsService,
  );
  const actor = { id: 'admin-1' } as never;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects invalid list status', () => {
    expect(() => {
      void controller.list(undefined, 'NOPE');
    }).toThrow(BadRequestException);
    try {
      void controller.list(undefined, 'NOPE');
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: ErrorCodes.VAL_INVALID_FORMAT }),
      );
    }
  });

  it('lists with archived and includeDeleted filters', () => {
    subscriptions.listSubscriptions.mockResolvedValue({ items: [], total: 0 });
    void controller.list(
      'ada',
      'ACTIVE',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'true',
      'ARCHIVED',
    );
    expect(subscriptions.listSubscriptions).toHaveBeenCalledWith(
      expect.objectContaining({
        q: 'ada',
        status: SubscriptionStatus.ACTIVE,
        includeDeleted: true,
        archived: 'ARCHIVED',
      }),
    );
  });

  it('creates via shared domain with guardian context', async () => {
    subscriptions.createSubscription.mockResolvedValue({ id: 'sub-1' });
    await controller.create(
      {
        patientUserId: 'u1',
        planId: 'plan-1',
        shippingPreferenceNotes: 'side door',
      },
      actor,
    );
    expect(subscriptions.createSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        context: 'guardian',
        source: 'guardian',
        actorUserId: 'admin-1',
        patientUserId: 'u1',
        planId: 'plan-1',
        shippingPreferenceNotes: 'side door',
      }),
    );
  });

  it('edits with guardian context including admin fields', async () => {
    subscriptions.updateFields.mockResolvedValue({});
    await controller.update(
      'sub-1',
      { adminTags: { vip: true }, reconciliationFlags: { review: true } },
      actor,
    );
    expect(subscriptions.updateFields).toHaveBeenCalledWith(
      expect.objectContaining({
        context: 'guardian',
        adminTags: { vip: true },
        reconciliationFlags: { review: true },
      }),
    );
  });

  it('lifecycle pause/resume/cancel/activate go through domain', async () => {
    subscriptions.pause.mockResolvedValue({});
    subscriptions.resume.mockResolvedValue({});
    subscriptions.cancel.mockResolvedValue({});
    subscriptions.activateInitial.mockResolvedValue({});

    await controller.pause('sub-1', { reason: 'hold' }, actor);
    await controller.resume('sub-1', {}, actor);
    await controller.cancel('sub-1', { reason: 'stop' }, actor);
    await controller.activate('sub-1', {}, actor);

    expect(subscriptions.pause).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'guardian', reason: 'hold' }),
    );
    expect(subscriptions.resume).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'guardian' }),
    );
    expect(subscriptions.cancel).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'guardian' }),
    );
    expect(subscriptions.activateInitial).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionId: 'sub-1',
        toStatus: SubscriptionStatus.ACTIVE,
        source: 'guardian',
      }),
    );
  });

  it('Class D delete/archive/restore require classDAuthorized', async () => {
    subscriptions.softDelete.mockResolvedValue({});
    subscriptions.archive.mockResolvedValue({});
    subscriptions.restore.mockResolvedValue({});

    await controller.softDelete('sub-1', { reason: 'cleanup' }, actor);
    await controller.archive('sub-1', { reason: 'archive' }, actor);
    await controller.restore('sub-1', { reason: 'restore' }, actor);

    expect(subscriptions.softDelete).toHaveBeenCalledWith(
      expect.objectContaining({ classDAuthorized: true }),
    );
    expect(subscriptions.archive).toHaveBeenCalledWith(
      expect.objectContaining({ classDAuthorized: true }),
    );
    expect(subscriptions.restore).toHaveBeenCalledWith(
      expect.objectContaining({ classDAuthorized: true }),
    );
  });

  it('corrections and overrides go through domain Class D methods', async () => {
    subscriptions.correctCustomerSnapshot.mockResolvedValue({});
    subscriptions.overrideStatus.mockResolvedValue({});

    await controller.correct(
      'sub-1',
      { reason: 'typo', email: 'fixed@example.com' },
      actor,
    );
    await controller.override(
      'sub-1',
      { toStatus: SubscriptionStatus.ACTIVE, reason: 'ops exception' },
      actor,
    );

    expect(subscriptions.correctCustomerSnapshot).toHaveBeenCalledWith({
      subscriptionId: 'sub-1',
      actorUserId: 'admin-1',
      reason: 'typo',
      classDAuthorized: true,
      customer: {
        firstName: undefined,
        lastName: undefined,
        email: 'fixed@example.com',
        phone: undefined,
      },
    });
    expect(subscriptions.overrideStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        toStatus: SubscriptionStatus.ACTIVE,
        reason: 'ops exception',
        classDAuthorized: true,
      }),
    );
  });

  it('opens a manual renewal and retries via domain', async () => {
    subscriptions.openRenewalAttempt.mockResolvedValue({ created: true });
    subscriptions.retryRenewalAttempt.mockResolvedValue({ created: false });
    await controller.openRenewal('sub-1', {}, actor);
    expect(subscriptions.openRenewalAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionId: 'sub-1',
        mode: 'manual',
        source: 'guardian',
      }),
    );
    await controller.retryRenewal('sub-1', 'att-1', actor);
    expect(subscriptions.retryRenewalAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionId: 'sub-1',
        attemptId: 'att-1',
        source: 'guardian',
      }),
    );
  });

  it('notes/history/activity/renewals read through domain', async () => {
    subscriptions.listNotes.mockResolvedValue([]);
    subscriptions.listStatusHistory.mockResolvedValue([]);
    subscriptions.listChangeHistory.mockResolvedValue([]);
    subscriptions.listActivity.mockResolvedValue([]);
    subscriptions.listRenewalAttempts.mockResolvedValue([]);

    await controller.notes('sub-1');
    await controller.history('sub-1');
    await controller.activity('sub-1');
    await controller.renewals('sub-1');

    expect(subscriptions.listNotes).toHaveBeenCalledWith('sub-1');
    expect(subscriptions.listStatusHistory).toHaveBeenCalledWith('sub-1');
    expect(subscriptions.listChangeHistory).toHaveBeenCalledWith('sub-1');
    expect(subscriptions.listActivity).toHaveBeenCalledWith('sub-1');
    expect(subscriptions.listRenewalAttempts).toHaveBeenCalledWith('sub-1');
  });
});
