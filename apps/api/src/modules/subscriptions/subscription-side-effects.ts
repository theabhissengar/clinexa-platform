/**
 * Integration hooks (P14c+ / Phase 3). Domain records intent only —
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
  /** Orders creates SUBSCRIPTION_RENEWAL from snapshot lines. Returns orderId or null. */
  onRequestRenewalOrder?(
    request: import('./subscription.types').RenewalOrderRequest,
  ): Promise<string | null>;
  /**
   * P3-SUB-001: Orders creates SUBSCRIPTION_INITIAL DRAFT from snapshot lines.
   * Returns orderId or null.
   */
  onRequestInitialOrder?(
    request: import('./subscription.types').InitialOrderRequest,
  ): Promise<string | null>;
  /**
   * P3-SUB-001: Fail closed before subscription insert when addresses are missing
   * (reuses RenewalAddressResolver user-shipping path).
   */
  onPreflightInitialOrderAddresses?(patientUserId: string): Promise<void>;
  /**
   * P3-SUB-002: Cancel allowlisted open INITIAL/RENEWAL orders after sub cancel.
   */
  onSubscriptionCancelled?(
    request: import('./subscription.types').CancelOpenOrdersRequest,
  ): Promise<void>;
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
