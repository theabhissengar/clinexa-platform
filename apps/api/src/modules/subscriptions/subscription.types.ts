import {
  SubscriptionBillingInterval,
  SubscriptionClinicalRequirement,
  SubscriptionRenewalAttemptStatus,
  SubscriptionStatus,
} from '../../../generated/prisma';

/** Application context for field allowlists (not AuthZ — API layer adds permissions). */
export type SubscriptionEditContext = 'crm' | 'guardian';

/** Who initiated create: CRM is forbidden in V1; Guardian admin and future System/checkout. */
export type SubscriptionCreateContext = 'crm' | 'guardian' | 'system';

export type PlanProductBinding = {
  productId: string;
  variantId: string;
  quantity: number;
};

export type CreateSubscriptionInput = {
  context: SubscriptionCreateContext;
  patientUserId: string;
  planId: string;
  actorUserId?: string | null;
  source?: string;
  customer?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  /** Optional existing SUBSCRIPTION_INITIAL order to bind. */
  initialOrderId?: string | null;
  endsAt?: Date | null;
  shippingPreferenceNotes?: string | null;
  opaquePayment?: {
    paymentMethodId?: string | null;
    providerCustomerRef?: string | null;
    providerSubscriptionRef?: string | null;
  };
};

export type TransitionSubscriptionInput = {
  subscriptionId: string;
  toStatus: SubscriptionStatus;
  actorUserId?: string | null;
  source: string;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  expectedStatus?: SubscriptionStatus;
  /** Required for ACTIVE → PAST_DUE (payment failure on a renewal attempt). */
  failedRenewalAttempt?: boolean;
};

export type PauseSubscriptionInput = {
  subscriptionId: string;
  actorUserId?: string | null;
  source: string;
  reason?: string | null;
};

export type ResumeSubscriptionInput = {
  subscriptionId: string;
  actorUserId?: string | null;
  source: string;
  reason?: string | null;
  now?: Date;
};

export type CancelSubscriptionInput = {
  subscriptionId: string;
  actorUserId?: string | null;
  source: string;
  reason?: string | null;
};

export type UpdateSubscriptionFieldsInput = {
  subscriptionId: string;
  context: SubscriptionEditContext;
  actorUserId?: string | null;
  shippingPreferenceNotes?: string | null;
  opsFlags?: unknown;
  adminTags?: unknown;
  reconciliationFlags?: unknown;
};

export type AddSubscriptionNoteInput = {
  subscriptionId: string;
  authorUserId: string;
  body: string;
};

export type ClassDSubscriptionInput = {
  subscriptionId: string;
  actorUserId?: string | null;
  reason?: string | null;
  classDAuthorized: true;
};

export type OverrideSubscriptionInput = {
  subscriptionId: string;
  toStatus: SubscriptionStatus;
  reason: string;
  actorUserId?: string | null;
  metadata?: Record<string, unknown> | null;
  classDAuthorized: true;
};

export type CorrectSubscriptionInput = {
  subscriptionId: string;
  actorUserId?: string | null;
  reason: string;
  classDAuthorized: true;
  customer?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
  };
};

export type SetClinicalRequirementInput = {
  subscriptionId: string;
  clinicalRequirement: SubscriptionClinicalRequirement;
  actorUserId?: string | null;
  source: string;
  reason?: string | null;
};

export type RecordPaymentSnapshotInput = {
  subscriptionId: string;
  paymentStatusSummary:
    'pending' | 'authorized_or_captured' | 'failed' | 'refunded';
  latestPaymentId?: string | null;
  actorUserId?: string | null;
  source: string;
};

export type OpenRenewalAttemptInput = {
  subscriptionId: string;
  mode: 'auto' | 'manual' | 'retry';
  actorUserId?: string | null;
  source: string;
  now?: Date;
};

export type AttachRenewalOrderInput = {
  subscriptionId: string;
  billingPeriodKey: string;
  orderId: string;
  actorUserId?: string | null;
  source: string;
};

export type PeriodPlanConfig = {
  billingInterval: SubscriptionBillingInterval;
  intervalCount: number;
  customIntervalDays: number | null;
};

export type ListSubscriptionsInput = {
  q?: string;
  status?: SubscriptionStatus | 'ALL';
  planId?: string;
  patientUserId?: string;
  nextRenewalFrom?: string;
  nextRenewalTo?: string;
  createdFrom?: string;
  createdTo?: string;
  skip?: number;
  take?: number;
  includeDeleted?: boolean;
  /** ACTIVE = not archived; ARCHIVED = archived only; ALL = both. */
  archived?: 'ACTIVE' | 'ARCHIVED' | 'ALL';
};

export type BillingPeriod = {
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  nextRenewalAt: Date;
  cycleNumber: number;
};

export type RenewalOrderRequest = {
  subscriptionId: string;
  patientUserId: string;
  billingPeriodKey: string;
  orderType: 'SUBSCRIPTION_RENEWAL';
  lines: Array<{
    productId: string;
    variantId: string;
    productName: string;
    sku: string;
    productType: string;
    isRxEligible: boolean;
    catalogMetadata: unknown;
    quantity: number;
    unitPriceCents: number;
    salePriceCents: number;
    currency: string;
  }>;
};

export { SubscriptionRenewalAttemptStatus };
