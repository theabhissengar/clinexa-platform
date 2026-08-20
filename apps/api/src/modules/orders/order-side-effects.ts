/**
 * Integration hooks for future modules (P13e Inventory, P13f Payments).
 * P13b records intent only — no Inventory table writes and no PSP calls.
 */
export type OrderInventoryHookEvent =
  | 'reserve_on_auth_success'
  | 'release_on_cancel_or_decline'
  | 'commit_on_fulfill'
  | 'restock_on_post_fulfill_refund';

export type OrderPaymentHookEvent =
  'authorization_recorded' | 'capture_required' | 'void_or_refund_required';

export interface OrderSideEffectHooks {
  onInventory?(event: OrderInventoryHookEvent, orderId: string): Promise<void>;
  onPayment?(event: OrderPaymentHookEvent, orderId: string): Promise<void>;
}

/** Default no-op hooks — safe until P13e/P13f wire real integrations. */
export const NOOP_ORDER_SIDE_EFFECTS: OrderSideEffectHooks = {};
