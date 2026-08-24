import { BadRequestException } from '@nestjs/common';
import { SubscriptionStatus } from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { SubscriptionsLifecycleService } from './subscriptions-lifecycle.service';

describe('SubscriptionsLifecycleService', () => {
  const service = new SubscriptionsLifecycleService();

  it('allows every approved transition', () => {
    const allowed: Array<[SubscriptionStatus, SubscriptionStatus]> = [
      [SubscriptionStatus.PENDING_SETUP, SubscriptionStatus.ACTIVE],
      [SubscriptionStatus.PENDING_SETUP, SubscriptionStatus.CANCELLED],
      [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAUSED],
      [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE],
      [SubscriptionStatus.ACTIVE, SubscriptionStatus.CANCELLED],
      [SubscriptionStatus.ACTIVE, SubscriptionStatus.EXPIRED],
      [SubscriptionStatus.ACTIVE, SubscriptionStatus.COMPLETED],
      [SubscriptionStatus.PAST_DUE, SubscriptionStatus.PAUSED],
      [SubscriptionStatus.PAST_DUE, SubscriptionStatus.ACTIVE],
      [SubscriptionStatus.PAST_DUE, SubscriptionStatus.CANCELLED],
      [SubscriptionStatus.PAUSED, SubscriptionStatus.ACTIVE],
      [SubscriptionStatus.PAUSED, SubscriptionStatus.PAST_DUE],
      [SubscriptionStatus.PAUSED, SubscriptionStatus.CANCELLED],
    ];
    for (const [from, to] of allowed) {
      const extras =
        from === SubscriptionStatus.ACTIVE && to === SubscriptionStatus.PAST_DUE
          ? { failedRenewalAttempt: true }
          : from === SubscriptionStatus.PAUSED
            ? { statusBeforePause: to }
            : undefined;
      expect(() => service.assertTransition(from, to, extras)).not.toThrow();
    }
    expect(() =>
      service.assertTransition(
        SubscriptionStatus.ACTIVE,
        SubscriptionStatus.PAST_DUE,
        { failedRenewalAttempt: true },
      ),
    ).not.toThrow();
  });

  it('rejects illegal and terminal reopen transitions', () => {
    const illegal: Array<[SubscriptionStatus, SubscriptionStatus]> = [
      [SubscriptionStatus.PENDING_SETUP, SubscriptionStatus.PAUSED],
      [SubscriptionStatus.PENDING_SETUP, SubscriptionStatus.PAST_DUE],
      [SubscriptionStatus.CANCELLED, SubscriptionStatus.ACTIVE],
      [SubscriptionStatus.EXPIRED, SubscriptionStatus.ACTIVE],
      [SubscriptionStatus.COMPLETED, SubscriptionStatus.ACTIVE],
      [SubscriptionStatus.PAUSED, SubscriptionStatus.PENDING_SETUP],
      [SubscriptionStatus.ACTIVE, SubscriptionStatus.PENDING_SETUP],
    ];
    for (const [from, to] of illegal) {
      try {
        service.assertTransition(from, to);
        fail(`expected ${from} → ${to} to throw`);
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).getResponse()).toMatchObject({
          code: ErrorCodes.SUB_INVALID_TRANSITION,
        });
      }
    }
  });

  it('rejects ACTIVE → PAST_DUE without a failed renewal attempt', () => {
    try {
      service.assertTransition(
        SubscriptionStatus.ACTIVE,
        SubscriptionStatus.PAST_DUE,
      );
      fail('expected throw');
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: ErrorCodes.SUB_INVALID_TRANSITION,
      });
    }
  });

  it('resume must restore statusBeforePause', () => {
    try {
      service.assertTransition(
        SubscriptionStatus.PAUSED,
        SubscriptionStatus.ACTIVE,
        { statusBeforePause: SubscriptionStatus.PAST_DUE },
      );
      fail('expected throw');
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: ErrorCodes.SUB_PAUSE_RESUME_FORBIDDEN,
      });
    }
  });

  it('marks cancelled/expired/completed as terminal and protects cancel', () => {
    expect(service.isTerminal(SubscriptionStatus.CANCELLED)).toBe(true);
    expect(service.isTerminal(SubscriptionStatus.EXPIRED)).toBe(true);
    expect(service.isTerminal(SubscriptionStatus.COMPLETED)).toBe(true);
    expect(service.isTerminal(SubscriptionStatus.ACTIVE)).toBe(false);
    expect(service.isCancellable(SubscriptionStatus.ACTIVE)).toBe(true);
    expect(service.isCancellable(SubscriptionStatus.CANCELLED)).toBe(false);
    expect(() =>
      service.assertCancellable(SubscriptionStatus.COMPLETED),
    ).toThrow(BadRequestException);
    expect(() =>
      service.assertPausable(SubscriptionStatus.PENDING_SETUP),
    ).toThrow(BadRequestException);
    expect(() => service.assertResumable(SubscriptionStatus.ACTIVE)).toThrow(
      BadRequestException,
    );
  });
});
