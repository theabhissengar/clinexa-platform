import type {
  PaymentInitiator,
  PaymentLifecycleState,
  PaymentPurpose,
  PaymentStatus,
} from '../../../generated/prisma';

/** Provider outcome class for reconcile (Phase 6B/6C). */
export type GatewayOutcomeClass =
  | 'SUCCESS'
  | 'CONFIRMED_FAILURE'
  | 'TIMEOUT'
  | 'NETWORK_UNKNOWN'
  | 'ACTION_REQUIRED';

export type GatewayAuthorizeInput = {
  amountCents: number;
  currency: string;
  providerMethodRef: string;
  idempotencyKey: string;
  metadata?: Record<string, string>;
  /** Stripe customer id (cus_…) when known — ignored by simulated. */
  providerCustomerRef?: string | null;
  /** Test-only force outcome (simulated adapter). */
  forceOutcome?: 'decline' | 'timeout' | 'action_required' | null;
};

export type GatewayAuthorizeResult = {
  success: boolean;
  outcomeClass?: GatewayOutcomeClass;
  providerPaymentRef?: string;
  providerAuthorizationRef?: string;
  authorizationExpiresAt?: Date;
  providerStatusRaw?: string;
  errorCode?: string;
  errorMessage?: string;
  /**
   * Ephemeral Stripe client_secret — only when outcomeClass === ACTION_REQUIRED.
   * Never persist, log, or return via staff PaymentOutcomeSummary.
   */
  clientSecret?: string;
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
  outcomeClass?: GatewayOutcomeClass;
  providerCaptureRef?: string;
  providerStatusRaw?: string;
  errorCode?: string;
  errorMessage?: string;
};

export type GatewayVoidInput = {
  providerPaymentRef: string;
  providerAuthorizationRef: string;
  idempotencyKey: string;
  forceOutcome?: 'decline' | 'timeout' | null;
};

export type GatewayVoidResult = {
  success: boolean;
  outcomeClass?: GatewayOutcomeClass;
  errorCode?: string;
  errorMessage?: string;
};

export type GatewayRefundInput = {
  providerPaymentRef: string;
  providerCaptureRef: string;
  amountCents: number;
  idempotencyKey: string;
  reason?: string;
  forceOutcome?: 'decline' | 'timeout' | null;
  /** Optional PSP metadata for webhook correlation (e.g. clinexa_payment_id). */
  metadata?: Record<string, string>;
};

export type GatewayRefundResult = {
  success: boolean;
  outcomeClass?: GatewayOutcomeClass;
  providerRefundRef?: string;
  errorCode?: string;
  errorMessage?: string;
};

export type GatewayCancelRecurringInput = {
  providerSubscriptionRef: string;
};

/** Explicit result — unsupported must not look like PSP success. */
export type GatewayCancelRecurringResult =
  | { ok: true }
  | {
      ok: false;
      unsupported: true;
      errorCode: string;
      errorMessage?: string;
    };

export type GatewayWebhookVerifyInput = {
  secretHeader: string | undefined;
  expectedSecret: string;
  rawBody?: string | Buffer;
  signatureHeader?: string;
};

/** When true, ingestWebhook skips shared-secret verify (Stripe HMAC already done). */
export type WebhookVerificationMode = 'shared_secret' | 'preverified';

/** Prefer provider refs; simulated may also key by idempotencyKey (sim-only). */
export type GatewayRetrieveInput = {
  providerPaymentRef?: string | null;
  providerAuthorizationRef?: string | null;
  providerCaptureRef?: string | null;
  providerRefundRef?: string | null;
  /** Simulated-only deterministic lookup — not assumed for real PSPs. */
  idempotencyKey?: string;
  operation: 'authorization' | 'capture' | 'refund';
};

export type GatewayRetrieveResult = {
  outcomeClass: GatewayOutcomeClass;
  lifecycleHint?:
    | 'AUTHORIZED'
    | 'AUTHORIZATION_FAILED'
    | 'CAPTURED'
    | 'CAPTURE_FAILED'
    | 'REFUNDED'
    | 'REFUND_FAILED'
    | 'VOIDED'
    | 'PENDING';
  providerPaymentRef?: string;
  providerAuthorizationRef?: string;
  providerCaptureRef?: string;
  providerRefundRef?: string;
  authorizationExpiresAt?: Date;
  providerStatusRaw?: string;
  errorCode?: string;
  errorMessage?: string;
  /** Ephemeral — ACTION_REQUIRED retrieve only; never persist. */
  clientSecret?: string;
};

/** Listed provider refund (Phase 6F — never use Search as proof of absence). */
export type GatewayListedRefund = {
  providerRefundRef: string;
  amountCents: number;
  currency?: string;
  status:
    | 'succeeded'
    | 'pending'
    | 'failed'
    | 'canceled'
    | 'requires_action'
    | 'unknown';
  paymentIntentRef?: string | null;
};

export type GatewayListRefundsResult = {
  /**
   * SUCCESS = list completed (refunds may be empty).
   * NETWORK_UNKNOWN / TIMEOUT = inconclusive — never treat as “no refunds”.
   */
  outcomeClass: GatewayOutcomeClass;
  refunds: GatewayListedRefund[];
  errorCode?: string;
  errorMessage?: string;
};

/**
 * Staff/renewal authorize outcome — no clientSecret.
 * Customer checkout builds a dedicated response from CustomerActionAuthResult.
 */
export type PaymentOutcomeSummary = {
  /** Null for zero-total noop (never write into UUID columns). */
  paymentId: string | null;
  status: PaymentStatus;
  lifecycleState: PaymentLifecycleState;
  paymentStatusSummary:
    'pending' | 'authorized_or_captured' | 'failed' | 'refunded';
};

/** Internal/customer-action authorize result (CheckoutService mapper only). */
export type CustomerActionAuthResult = PaymentOutcomeSummary & {
  outcomeClass?: GatewayOutcomeClass;
  requiresAction: boolean;
  /** Only when requiresAction && Stripe still requires_action. */
  clientSecret?: string;
};

export type AuthorizeForOrderInput = {
  orderId: string;
  subscriptionId?: string | null;
  /** Required when amountCents > 0; omit for zero-total. */
  paymentMethodId?: string | null;
  amountCents: number;
  currency: string;
  purpose?: PaymentPurpose;
  initiator?: PaymentInitiator;
  idempotencyKey: string;
  forceOutcome?: 'decline' | 'timeout' | 'action_required' | null;
  /**
   * When true, return CustomerActionAuthResult including ephemeral clientSecret
   * on ACTION_REQUIRED. Staff/renewal callers leave false/undefined.
   */
  includeCustomerAction?: boolean;
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

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');
