import type {
  PaymentLifecycleState,
  PaymentPurpose,
  PaymentStatus,
} from '../../../generated/prisma';

export type GatewayAuthorizeInput = {
  amountCents: number;
  currency: string;
  providerMethodRef: string;
  idempotencyKey: string;
  metadata?: Record<string, string>;
  /** Test-only force outcome (simulated adapter). */
  forceOutcome?: 'decline' | 'timeout' | null;
};

export type GatewayAuthorizeResult = {
  success: boolean;
  providerPaymentRef?: string;
  providerAuthorizationRef?: string;
  errorCode?: string;
  errorMessage?: string;
};

export type GatewayCaptureInput = {
  providerPaymentRef: string;
  providerAuthorizationRef: string;
  amountCents: number;
  idempotencyKey: string;
  forceOutcome?: 'decline' | 'timeout' | null;
};

export type GatewayCaptureResult = {
  success: boolean;
  providerCaptureRef?: string;
  errorCode?: string;
  errorMessage?: string;
};

export type GatewayVoidInput = {
  providerPaymentRef: string;
  providerAuthorizationRef: string;
  idempotencyKey: string;
};

export type GatewayVoidResult = {
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
};

export type GatewayRefundInput = {
  providerPaymentRef: string;
  providerCaptureRef: string;
  amountCents: number;
  idempotencyKey: string;
  reason?: string;
};

export type GatewayRefundResult = {
  success: boolean;
  providerRefundRef?: string;
  errorCode?: string;
  errorMessage?: string;
};

export type GatewayCancelRecurringInput = {
  providerSubscriptionRef: string;
};

export type GatewayWebhookVerifyInput = {
  secretHeader: string | undefined;
  expectedSecret: string;
  rawBody?: string;
};

export type AuthorizeForOrderInput = {
  orderId: string;
  subscriptionId?: string | null;
  paymentMethodId: string;
  amountCents: number;
  currency?: string;
  purpose?: PaymentPurpose;
  idempotencyKey: string;
  forceOutcome?: 'decline' | 'timeout' | null;
};

export type CapturePaymentInput = {
  paymentId: string;
  idempotencyKey: string;
  forceOutcome?: 'decline' | 'timeout' | null;
};

export type VoidOrRefundInput = {
  orderId: string;
  reason?: string;
  actorUserId?: string | null;
  idempotencyKey: string;
};

export type WebhookEnvelope = {
  provider: string;
  providerEventId: string;
  type: string;
  paymentRef?: string;
  data?: Record<string, unknown>;
};

export type PaymentOutcomeSummary = {
  paymentId: string;
  status: PaymentStatus;
  lifecycleState: PaymentLifecycleState;
  paymentStatusSummary:
    'pending' | 'authorized_or_captured' | 'failed' | 'refunded';
};

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');
