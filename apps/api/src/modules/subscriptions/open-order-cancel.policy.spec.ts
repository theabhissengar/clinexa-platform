import { OrderStatus, PaymentLifecycleState } from '../../../generated/prisma';

import { shouldSkipOpenOrderCancel } from './open-order-cancel.policy';

describe('shouldSkipOpenOrderCancel (P3-SUB-002)', () => {
  it('does not skip DRAFT regardless of payment lifecycle', () => {
    expect(
      shouldSkipOpenOrderCancel(
        OrderStatus.DRAFT,
        PaymentLifecycleState.CAPTURED,
      ),
    ).toBe(false);
  });

  it('does not skip PAYMENT_PENDING with no payment', () => {
    expect(shouldSkipOpenOrderCancel(OrderStatus.PAYMENT_PENDING, null)).toBe(
      false,
    );
  });

  it('does not skip PAYMENT_PENDING with AUTHORIZED (void path OK)', () => {
    expect(
      shouldSkipOpenOrderCancel(
        OrderStatus.PAYMENT_PENDING,
        PaymentLifecycleState.AUTHORIZED,
      ),
    ).toBe(false);
  });

  it('skips PAYMENT_PENDING + CAPTURED / REFUND_PENDING / REFUNDED', () => {
    expect(
      shouldSkipOpenOrderCancel(
        OrderStatus.PAYMENT_PENDING,
        PaymentLifecycleState.CAPTURED,
      ),
    ).toBe(true);
    expect(
      shouldSkipOpenOrderCancel(
        OrderStatus.PAYMENT_PENDING,
        PaymentLifecycleState.REFUND_PENDING,
      ),
    ).toBe(true);
    expect(
      shouldSkipOpenOrderCancel(
        OrderStatus.PAYMENT_PENDING,
        PaymentLifecycleState.REFUNDED,
      ),
    ).toBe(true);
  });
});
