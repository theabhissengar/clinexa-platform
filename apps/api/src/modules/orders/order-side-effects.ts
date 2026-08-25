/**
 * Integration hooks for Payments (P13f) and optional Inventory observability (P13e).
 * Inventory ledger mutations run in-txn via OrderInventoryOrchestrator — not via onInventory.
 * P14g: onEnteredClinicalReview mints opaque consultationId via Clinical adapter.
 */
export type OrderInventoryHookEvent =
  | 'reserve_on_auth_success'
  | 'release_on_cancel_or_decline'
  | 'commit_on_fulfill'
  | 'restock_on_post_fulfill_refund';

export type OrderPaymentHookEvent =
  'authorization_recorded' | 'capture_required' | 'void_or_refund_required';

export interface OrderSideEffectHooks {
  /** Observability only — mutations are in-txn (P13e). */
  onInventory?(event: OrderInventoryHookEvent, orderId: string): Promise<void>;
  onPayment?(event: OrderPaymentHookEvent, orderId: string): Promise<void>;
  /**
   * After Order enters AWAITING_CLINICAL_REVIEW — Clinical adapter attaches opaque refs.
   * Not clinical SoT authoring.
   */
  onEnteredClinicalReview?(orderId: string): Promise<void>;
}

/** Default no-op hooks — payment/clinical wiring is applied by CommerceIntegrationModule. */
export const NOOP_ORDER_SIDE_EFFECTS: OrderSideEffectHooks = {};
