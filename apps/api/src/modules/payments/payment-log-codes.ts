/**
 * Stable payment log/event codes (Phase 6G O1).
 * Log these as structured `code=` tokens — never secrets, PAN, CVV, or clientSecret.
 */
export const PaymentLogCodes = {
  REFUND_INCONCLUSIVE: 'pay.refund.inconclusive',
  REFUND_CONFIRMED_FAILURE: 'pay.refund.confirmed_failure',
  CAPTURE_RECOVERY: 'pay.capture.recovery',
  REQUIRES_ACTION_STAMP: 'pay.sca.requires_action',
  AUTHORIZE_ORDER_LOCK: 'pay.authorize.order_lock',
  WEBHOOK_INVALID: 'pay.webhook.invalid',
} as const;

export type PaymentLogCode =
  (typeof PaymentLogCodes)[keyof typeof PaymentLogCodes];
