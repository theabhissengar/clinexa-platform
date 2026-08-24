import { BadRequestException } from '@nestjs/common';
import { SubscriptionStatus } from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { CrmSubscriptionsController } from './crm-subscriptions.controller';
import type { SubscriptionsService } from './subscriptions.service';

describe('CrmSubscriptionsController', () => {
  const subscriptions = {
    listSubscriptions: jest.fn(),
    getById: jest.fn(),
    updateFields: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    cancel: jest.fn(),
    listRenewalAttempts: jest.fn(),
    openRenewalAttempt: jest.fn(),
    retryRenewalAttempt: jest.fn(),
    listNotes: jest.fn(),
    addNote: jest.fn(),
    listStatusHistory: jest.fn(),
    listChangeHistory: jest.fn(),
    listActivity: jest.fn(),
    createSubscription: jest.fn(),
    softDelete: jest.fn(),
  };

  const controller = new CrmSubscriptionsController(
    subscriptions as unknown as SubscriptionsService,
  );
  const actor = { id: 'staff-1' } as never;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects invalid status filter', () => {
    expect(() => {
      void controller.list(undefined, 'NOT_A_STATUS');
    }).toThrow(BadRequestException);
    try {
      void controller.list(undefined, 'NOT_A_STATUS');
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: ErrorCodes.VAL_INVALID_FORMAT }),
      );
    }
  });

  it('lists via domain listSubscriptions', () => {
    subscriptions.listSubscriptions.mockResolvedValue({ items: [], total: 0 });
    void controller.list('ada', 'ACTIVE', 'plan-1', 'user-1');
    expect(subscriptions.listSubscriptions).toHaveBeenCalledWith(
      expect.objectContaining({
        q: 'ada',
        status: SubscriptionStatus.ACTIVE,
        planId: 'plan-1',
        patientUserId: 'user-1',
      }),
    );
  });

  it('strips Guardian admin metadata from CRM detail', async () => {
    subscriptions.getById.mockResolvedValue({
      id: 'sub-1',
      subscriptionNumber: 'SUB-1',
      status: SubscriptionStatus.ACTIVE,
      adminTags: { secret: true },
      reconciliationFlags: { flag: 1 },
      shippingPreferenceNotes: 'leave at door',
    });
    const result = await controller.get('sub-1');
    expect(result).not.toHaveProperty('adminTags');
    expect(result).not.toHaveProperty('reconciliationFlags');
    expect(result).toHaveProperty('shippingPreferenceNotes', 'leave at door');
  });

  it('updates through CRM edit context only', async () => {
    subscriptions.updateFields.mockResolvedValue({
      id: 'sub-1',
      subscriptionNumber: 'SUB-1',
      status: SubscriptionStatus.ACTIVE,
      updatedAt: new Date(),
    });
    await controller.update(
      'sub-1',
      { shippingPreferenceNotes: 'side door' },
      actor,
    );
    expect(subscriptions.updateFields).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionId: 'sub-1',
        context: 'crm',
        actorUserId: 'staff-1',
        shippingPreferenceNotes: 'side door',
      }),
    );
  });

  it('pause/resume/cancel go through domain lifecycle methods', async () => {
    const summary = {
      id: 'sub-1',
      subscriptionNumber: 'SUB-1',
      status: SubscriptionStatus.PAUSED,
      updatedAt: new Date(),
    };
    subscriptions.pause.mockResolvedValue(summary);
    subscriptions.resume.mockResolvedValue({
      ...summary,
      status: SubscriptionStatus.ACTIVE,
    });
    subscriptions.cancel.mockResolvedValue({
      ...summary,
      status: SubscriptionStatus.CANCELLED,
    });

    await controller.pause('sub-1', { reason: 'hold' }, actor);
    expect(subscriptions.pause).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'crm', reason: 'hold' }),
    );

    await controller.resume('sub-1', {}, actor);
    expect(subscriptions.resume).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'crm' }),
    );

    await controller.cancel('sub-1', { reason: 'patient request' }, actor);
    expect(subscriptions.cancel).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'crm', reason: 'patient request' }),
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
        source: 'crm',
      }),
    );
    await controller.retryRenewal('sub-1', 'att-1', actor);
    expect(subscriptions.retryRenewalAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionId: 'sub-1',
        attemptId: 'att-1',
        source: 'crm',
      }),
    );
  });

  it('does not expose create or Class D on the CRM controller', () => {
    const prototype = CrmSubscriptionsController.prototype as Record<
      string,
      unknown
    >;
    for (const method of [
      'create',
      'softDelete',
      'archive',
      'restore',
      'correct',
      'override',
      'delete',
    ]) {
      expect(typeof prototype[method]).not.toBe('function');
    }
  });
});
