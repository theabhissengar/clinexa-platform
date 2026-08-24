import { BadRequestException, Injectable } from '@nestjs/common';
import { SubscriptionBillingInterval } from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import type { BillingPeriod, PeriodPlanConfig } from './subscription.types';

/**
 * Deterministic billing period / nextRenewalAt / billingPeriodKey math (docs/36 §11).
 */
@Injectable()
export class SubscriptionsScheduleService {
  assertIntervalConfig(plan: PeriodPlanConfig): void {
    if (!Number.isInteger(plan.intervalCount) || plan.intervalCount < 1) {
      throw new BadRequestException({
        code: ErrorCodes.VAL_INVALID_FORMAT,
        message: 'Plan intervalCount must be an integer >= 1',
      });
    }
    if (plan.billingInterval === SubscriptionBillingInterval.CUSTOM) {
      if (
        plan.customIntervalDays == null ||
        !Number.isInteger(plan.customIntervalDays) ||
        plan.customIntervalDays < 1
      ) {
        throw new BadRequestException({
          code: ErrorCodes.VAL_INVALID_FORMAT,
          message: 'CUSTOM billing interval requires customIntervalDays >= 1',
        });
      }
    }
  }

  addInterval(from: Date, plan: PeriodPlanConfig): Date {
    this.assertIntervalConfig(plan);
    const next = new Date(from.getTime());
    const n = plan.intervalCount;
    switch (plan.billingInterval) {
      case SubscriptionBillingInterval.WEEK:
        next.setUTCDate(next.getUTCDate() + 7 * n);
        break;
      case SubscriptionBillingInterval.MONTH:
        next.setUTCMonth(next.getUTCMonth() + n);
        break;
      case SubscriptionBillingInterval.QUARTER:
        next.setUTCMonth(next.getUTCMonth() + 3 * n);
        break;
      case SubscriptionBillingInterval.YEAR:
        next.setUTCFullYear(next.getUTCFullYear() + n);
        break;
      case SubscriptionBillingInterval.CUSTOM:
        next.setUTCDate(
          next.getUTCDate() + (plan.customIntervalDays as number) * n,
        );
        break;
      default:
        throw new BadRequestException({
          code: ErrorCodes.VAL_INVALID_FORMAT,
          message: 'Unknown billing interval',
        });
    }
    return next;
  }

  firstPeriod(now: Date, plan: PeriodPlanConfig): BillingPeriod {
    const currentPeriodStart = new Date(now.getTime());
    const currentPeriodEnd = this.addInterval(currentPeriodStart, plan);
    return {
      currentPeriodStart,
      currentPeriodEnd,
      nextRenewalAt: new Date(currentPeriodEnd.getTime()),
      cycleNumber: 1,
    };
  }

  advancePeriod(
    currentPeriodEnd: Date,
    cycleNumber: number,
    plan: PeriodPlanConfig,
  ): BillingPeriod {
    const currentPeriodStart = new Date(currentPeriodEnd.getTime());
    const nextEnd = this.addInterval(currentPeriodStart, plan);
    return {
      currentPeriodStart,
      currentPeriodEnd: nextEnd,
      nextRenewalAt: new Date(nextEnd.getTime()),
      cycleNumber: cycleNumber + 1,
    };
  }

  /**
   * V1 key: `{subscriptionId}:{periodEnd}` UTC ISO date of currentPeriodEnd
   * for the period being billed (SUB-IDEM-003).
   */
  billingPeriodKey(subscriptionId: string, periodEnd: Date): string {
    return `${subscriptionId}:${periodEnd.toISOString().slice(0, 10)}`;
  }

  /**
   * SUB-PAUSE-005: keep future nextRenewalAt; if due/past, resume timestamp + interval.
   */
  nextRenewalAtOnResume(
    now: Date,
    currentNextRenewalAt: Date | null,
    plan: PeriodPlanConfig,
  ): Date {
    if (
      currentNextRenewalAt &&
      currentNextRenewalAt.getTime() > now.getTime()
    ) {
      return new Date(currentNextRenewalAt.getTime());
    }
    return this.addInterval(now, plan);
  }
}
