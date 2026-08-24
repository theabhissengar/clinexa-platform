import { SubscriptionBillingInterval } from '../../../generated/prisma';

import { SubscriptionsScheduleService } from './subscriptions-schedule.service';

describe('SubscriptionsScheduleService', () => {
  const service = new SubscriptionsScheduleService();
  const monthPlan = {
    billingInterval: SubscriptionBillingInterval.MONTH,
    intervalCount: 1,
    customIntervalDays: null,
  };

  it('computes first period, next period, cycle, nextRenewalAt, and billingPeriodKey', () => {
    const start = new Date(Date.UTC(2026, 0, 15, 12, 0, 0));
    const first = service.firstPeriod(start, monthPlan);
    expect(first.cycleNumber).toBe(1);
    expect(first.currentPeriodStart.toISOString()).toBe(start.toISOString());
    expect(first.currentPeriodEnd.toISOString()).toBe(
      new Date(Date.UTC(2026, 1, 15, 12, 0, 0)).toISOString(),
    );
    expect(first.nextRenewalAt.toISOString()).toBe(
      first.currentPeriodEnd.toISOString(),
    );

    const next = service.advancePeriod(
      first.currentPeriodEnd,
      first.cycleNumber,
      monthPlan,
    );
    expect(next.cycleNumber).toBe(2);
    expect(next.currentPeriodStart.toISOString()).toBe(
      first.currentPeriodEnd.toISOString(),
    );
    expect(next.currentPeriodEnd.toISOString()).toBe(
      new Date(Date.UTC(2026, 2, 15, 12, 0, 0)).toISOString(),
    );

    const key = service.billingPeriodKey('sub-1', first.currentPeriodEnd);
    expect(key).toBe('sub-1:2026-02-15');
  });

  it('applies week, quarter, year, and custom intervals', () => {
    const from = new Date(Date.UTC(2026, 0, 1));
    expect(
      service
        .addInterval(from, {
          billingInterval: SubscriptionBillingInterval.WEEK,
          intervalCount: 2,
          customIntervalDays: null,
        })
        .toISOString(),
    ).toBe(new Date(Date.UTC(2026, 0, 15)).toISOString());
    expect(
      service
        .addInterval(from, {
          billingInterval: SubscriptionBillingInterval.QUARTER,
          intervalCount: 1,
          customIntervalDays: null,
        })
        .toISOString(),
    ).toBe(new Date(Date.UTC(2026, 3, 1)).toISOString());
    expect(
      service
        .addInterval(from, {
          billingInterval: SubscriptionBillingInterval.YEAR,
          intervalCount: 1,
          customIntervalDays: null,
        })
        .toISOString(),
    ).toBe(new Date(Date.UTC(2027, 0, 1)).toISOString());
    expect(
      service
        .addInterval(from, {
          billingInterval: SubscriptionBillingInterval.CUSTOM,
          intervalCount: 1,
          customIntervalDays: 10,
        })
        .toISOString(),
    ).toBe(new Date(Date.UTC(2026, 0, 11)).toISOString());
  });

  it('on resume keeps a future nextRenewalAt and skips missed paused time', () => {
    const now = new Date(Date.UTC(2026, 5, 1));
    const future = new Date(Date.UTC(2026, 6, 1));
    expect(
      service.nextRenewalAtOnResume(now, future, monthPlan).toISOString(),
    ).toBe(future.toISOString());

    const past = new Date(Date.UTC(2026, 4, 1));
    const skipped = service.nextRenewalAtOnResume(now, past, monthPlan);
    expect(skipped.toISOString()).toBe(
      new Date(Date.UTC(2026, 6, 1)).toISOString(),
    );
  });

  it('rejects invalid CUSTOM interval configuration', () => {
    expect(() =>
      service.assertIntervalConfig({
        billingInterval: SubscriptionBillingInterval.CUSTOM,
        intervalCount: 1,
        customIntervalDays: null,
      }),
    ).toThrow();
    expect(() =>
      service.assertIntervalConfig({
        billingInterval: SubscriptionBillingInterval.MONTH,
        intervalCount: 0,
        customIntervalDays: null,
      }),
    ).toThrow();
  });
});
