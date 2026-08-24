import { BadRequestException, Injectable } from '@nestjs/common';
import { SubscriptionStatus } from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';

/**
 * Canonical Subscription lifecycle (docs/36 §9). Payment, renewal-attempt,
 * and clinical requirement are separate dimensions — not represented here.
 */
const ALLOWED: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  [SubscriptionStatus.PENDING_SETUP]: [
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.CANCELLED,
  ],
  [SubscriptionStatus.ACTIVE]: [
    SubscriptionStatus.PAUSED,
    SubscriptionStatus.PAST_DUE,
    SubscriptionStatus.CANCELLED,
    SubscriptionStatus.EXPIRED,
    SubscriptionStatus.COMPLETED,
  ],
  [SubscriptionStatus.PAST_DUE]: [
    SubscriptionStatus.PAUSED,
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.CANCELLED,
  ],
  [SubscriptionStatus.PAUSED]: [
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.PAST_DUE,
    SubscriptionStatus.CANCELLED,
  ],
  [SubscriptionStatus.CANCELLED]: [],
  [SubscriptionStatus.EXPIRED]: [],
  [SubscriptionStatus.COMPLETED]: [],
};

const TERMINAL: ReadonlySet<SubscriptionStatus> = new Set([
  SubscriptionStatus.CANCELLED,
  SubscriptionStatus.EXPIRED,
  SubscriptionStatus.COMPLETED,
]);

const CANCELLABLE: ReadonlySet<SubscriptionStatus> = new Set([
  SubscriptionStatus.PENDING_SETUP,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
  SubscriptionStatus.PAUSED,
]);

const PAUSABLE: ReadonlySet<SubscriptionStatus> = new Set([
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
]);

export type LifecycleAssertExtras = {
  /** ACTIVE → PAST_DUE must come from a failed renewal payment attempt. */
  failedRenewalAttempt?: boolean;
  /** Resume must restore statusBeforePause. */
  statusBeforePause?: SubscriptionStatus | null;
};

@Injectable()
export class SubscriptionsLifecycleService {
  assertTransition(
    from: SubscriptionStatus,
    to: SubscriptionStatus,
    extras?: LifecycleAssertExtras,
  ): void {
    if (from === to) {
      return;
    }
    if (!ALLOWED[from].includes(to)) {
      throw new BadRequestException({
        code: ErrorCodes.SUB_INVALID_TRANSITION,
        message: `Invalid subscription lifecycle transition: ${from} → ${to}`,
      });
    }

    if (
      from === SubscriptionStatus.ACTIVE &&
      to === SubscriptionStatus.PAST_DUE &&
      extras?.failedRenewalAttempt !== true
    ) {
      throw new BadRequestException({
        code: ErrorCodes.SUB_INVALID_TRANSITION,
        message: 'ACTIVE → PAST_DUE requires a failed renewal payment attempt',
      });
    }

    if (
      from === SubscriptionStatus.PAUSED &&
      (to === SubscriptionStatus.ACTIVE || to === SubscriptionStatus.PAST_DUE)
    ) {
      const prior = extras?.statusBeforePause;
      if (prior && prior !== to) {
        throw new BadRequestException({
          code: ErrorCodes.SUB_PAUSE_RESUME_FORBIDDEN,
          message: `Resume must restore statusBeforePause (${prior})`,
        });
      }
    }
  }

  isTerminal(status: SubscriptionStatus): boolean {
    return TERMINAL.has(status);
  }

  isCancellable(status: SubscriptionStatus): boolean {
    return CANCELLABLE.has(status);
  }

  isPausable(status: SubscriptionStatus): boolean {
    return PAUSABLE.has(status);
  }

  isAllowed(
    from: SubscriptionStatus,
    to: SubscriptionStatus,
    extras?: LifecycleAssertExtras,
  ): boolean {
    try {
      this.assertTransition(from, to, extras);
      return true;
    } catch {
      return false;
    }
  }

  allowedNext(from: SubscriptionStatus): SubscriptionStatus[] {
    return [...ALLOWED[from]];
  }

  assertCancellable(status: SubscriptionStatus): void {
    if (!this.isCancellable(status)) {
      throw new BadRequestException({
        code: ErrorCodes.SUB_NOT_CANCELLABLE,
        message: `Subscription cannot be cancelled from ${status}`,
      });
    }
  }

  assertPausable(status: SubscriptionStatus): void {
    if (!this.isPausable(status)) {
      throw new BadRequestException({
        code: ErrorCodes.SUB_PAUSE_RESUME_FORBIDDEN,
        message: `Subscription cannot be paused from ${status}`,
      });
    }
  }

  assertResumable(status: SubscriptionStatus): void {
    if (status !== SubscriptionStatus.PAUSED) {
      throw new BadRequestException({
        code: ErrorCodes.SUB_PAUSE_RESUME_FORBIDDEN,
        message: `Subscription cannot be resumed from ${status}`,
      });
    }
  }
}
