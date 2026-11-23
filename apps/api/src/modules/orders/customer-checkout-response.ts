import type {
  OrderStatus,
  PaymentLifecycleState,
  PaymentStatus,
} from '../../../generated/prisma';

import type { CustomerActionAuthResult } from '../payments/payment.types';

/** Owner-only checkout/pay/reconcile response — never includes providerPaymentRef. */
export type CustomerCheckoutResponse = {
  orderId: string;
  orderStatus: OrderStatus;
  paymentId: string | null;
  lifecycleState: PaymentLifecycleState | null;
  paymentStatusSummary:
    'pending' | 'authorized_or_captured' | 'failed' | 'refunded' | null;
  requiresAction: boolean;
  clientSecret?: string;
  totalCents: number;
  currency: string;
  transitioned: boolean;
};

export function mapCustomerCheckoutResponse(input: {
  orderId: string;
  orderStatus: OrderStatus;
  totalCents: number;
  currency: string;
  transitioned: boolean;
  auth?:
    | CustomerActionAuthResult
    | {
        paymentId: string | null;
        status: PaymentStatus;
        lifecycleState: PaymentLifecycleState;
        paymentStatusSummary:
          'pending' | 'authorized_or_captured' | 'failed' | 'refunded';
        requiresAction?: boolean;
        clientSecret?: string;
      }
    | null;
}): CustomerCheckoutResponse {
  const auth = input.auth;
  const requiresAction = auth?.requiresAction === true;
  const response: CustomerCheckoutResponse = {
    orderId: input.orderId,
    orderStatus: input.orderStatus,
    paymentId: auth?.paymentId ?? null,
    lifecycleState: auth?.lifecycleState ?? null,
    paymentStatusSummary: auth?.paymentStatusSummary ?? null,
    requiresAction,
    totalCents: input.totalCents,
    currency: input.currency,
    transitioned: input.transitioned,
  };
  if (requiresAction && auth && 'clientSecret' in auth && auth.clientSecret) {
    response.clientSecret = auth.clientSecret;
  }
  return response;
}
