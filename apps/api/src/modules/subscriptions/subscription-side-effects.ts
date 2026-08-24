/**
 * Integration hooks for later slices (P14c+). P14b records intent only —
 * no Payments execution, Inventory table writes, or clinical authoring.
 */
export type SubscriptionNotificationEvent =
  | 'subscription.started'
  | 'subscription.renewed'
  | 'subscription.past_due'
  | 'subscription.cancelled'
  | 'subscription.reassessment';

export type SubscriptionPaymentHookEvent =
  'cancel_provider_recurring' | 'payment_snapshot_recorded';

export interface SubscriptionSideEffectHooks {
  /** Later: Orders creates SUBSCRIPTION_RENEWAL from snapshot lines. Returns orderId or null. */
  onRequestRenewalOrder?(
    request: import('./subscription.types').RenewalOrderRequest,
  ): Promise<string | null>;
  onPayment?(
    event: SubscriptionPaymentHookEvent,
    subscriptionId: string,
    providerSubscriptionRef?: string | null,
  ): Promise<void>;
  onNotify?(
    event: SubscriptionNotificationEvent,
    subscriptionId: string,
  ): Promise<void>;
}

export const NOOP_SUBSCRIPTION_SIDE_EFFECTS: SubscriptionSideEffectHooks = {};
