import { OrderStatus, PaymentLifecycleState } from '../../../generated/prisma';

const SKIP_LIFECYCLES: ReadonlySet<PaymentLifecycleState> = new Set([
  PaymentLifecycleState.CAPTURED,
  PaymentLifecycleState.REFUND_PENDING,
  PaymentLifecycleState.REFUNDED,
]);

/**
 * P3-SUB-002: PAYMENT_PENDING + CAPTURED/REFUND_* must not auto-cancel
 * (void_or_refund would refund CAPTURED — violates P14f).
 */
export function shouldSkipOpenOrderCancel(
  orderStatus: OrderStatus,
  lifecycle: PaymentLifecycleState | null,
): boolean {
  if (orderStatus !== OrderStatus.PAYMENT_PENDING) {
    return false;
  }
  if (lifecycle == null) {
    return false;
  }
  return SKIP_LIFECYCLES.has(lifecycle);
}
