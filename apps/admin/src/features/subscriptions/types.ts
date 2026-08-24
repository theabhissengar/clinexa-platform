export type SubscriptionStatus =
  | "PENDING_SETUP"
  | "ACTIVE"
  | "PAUSED"
  | "PAST_DUE"
  | "CANCELLED"
  | "EXPIRED"
  | "COMPLETED";

export type SubscriptionClinicalRequirement =
  | "NONE"
  | "REASSESSMENT_REQUIRED"
  | "DECLINED_HOLD";

export type SubscriptionBillingInterval =
  | "WEEK"
  | "MONTH"
  | "QUARTER"
  | "YEAR"
  | "CUSTOM";

export type SubscriptionPlanRef = {
  id: string;
  name: string;
  billingInterval?: SubscriptionBillingInterval;
  intervalCount?: number;
  lifecycleStatus?: string;
  priceCents?: number;
  currency?: string;
  customIntervalDays?: number | null;
};

export type SubscriptionListItem = {
  id: string;
  subscriptionNumber: string | null;
  status: SubscriptionStatus;
  patientUserId: string;
  customerFirstName: string | null;
  customerLastName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  planId: string;
  cycleNumber: number;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  nextRenewalAt: string | null;
  paymentStatusSummary: string | null;
  clinicalRequirement: SubscriptionClinicalRequirement;
  initialOrderId: string | null;
  latestOrderId: string | null;
  archivedAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  plan: SubscriptionPlanRef;
};

export type SubscriptionListResponse = {
  items: SubscriptionListItem[];
  total: number;
  statusCounts: Record<string, number>;
  plans: Array<{ id: string; name: string; lifecycleStatus: string }>;
};

export type SubscriptionItem = {
  id: string;
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
};

export type SubscriptionPatientRef = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  phone: string | null;
  status: string;
};

export type SubscriptionOrderRef = {
  id: string;
  orderNumber: string;
  status: string;
};

export type SubscriptionDetail = SubscriptionListItem & {
  shippingPreferenceNotes: string | null;
  opsFlags: unknown;
  adminTags?: unknown;
  reconciliationFlags?: unknown;
  pausedAt: string | null;
  statusBeforePause: SubscriptionStatus | null;
  endsAt: string | null;
  paymentMethodId: string | null;
  providerCustomerRef: string | null;
  providerSubscriptionRef: string | null;
  latestPaymentId: string | null;
  items: SubscriptionItem[];
  plan: SubscriptionPlanRef;
  patient: SubscriptionPatientRef;
  initialOrder: SubscriptionOrderRef | null;
  latestOrder: SubscriptionOrderRef | null;
  allowedNextStatuses: SubscriptionStatus[];
  canCancel: boolean;
  canPause: boolean;
  canResume: boolean;
};

export type SubscriptionNote = {
  id: string;
  subscriptionId: string;
  authorUserId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type SubscriptionStatusHistory = {
  id: string;
  subscriptionId: string;
  fromStatus: SubscriptionStatus | null;
  toStatus: SubscriptionStatus;
  actorUserId: string | null;
  source: string;
  reason: string | null;
  metadata: unknown;
  createdAt: string;
};

export type SubscriptionChangeHistory = {
  id: string;
  subscriptionId: string;
  actorId: string | null;
  action: string;
  changes: unknown;
  createdAt: string;
};

export type SubscriptionHistoryResponse = {
  status: SubscriptionStatusHistory[];
  changes: SubscriptionChangeHistory[];
};

export type SubscriptionActivity = {
  id: string;
  subscriptionId: string;
  actorUserId: string | null;
  kind: string;
  summary: string;
  metadata: unknown;
  createdAt: string;
};

export type SubscriptionRenewalAttempt = {
  id: string;
  subscriptionId: string;
  billingPeriodKey: string;
  status: string;
  orderId: string | null;
  paymentStatusSummary: string | null;
  retryCount: number;
  lastErrorCode: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
};

export type UpdateCrmSubscriptionPayload = {
  shippingPreferenceNotes?: string | null;
  opsFlags?: Record<string, unknown> | null;
};

export type UpdateAdminSubscriptionPayload = UpdateCrmSubscriptionPayload & {
  adminTags?: Record<string, unknown> | null;
  reconciliationFlags?: Record<string, unknown> | null;
};

export type CreateAdminSubscriptionPayload = {
  patientUserId: string;
  planId: string;
  customer?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  initialOrderId?: string | null;
  endsAt?: string | null;
  shippingPreferenceNotes?: string | null;
  opaquePayment?: {
    paymentMethodId?: string | null;
    providerCustomerRef?: string | null;
    providerSubscriptionRef?: string | null;
  };
};

export type SubscriptionPlanStatus =
  | "DRAFT"
  | "PUBLISHED"
  | "UNPUBLISHED"
  | "ARCHIVED";

export type PlanProductBinding = {
  productId: string;
  variantId: string;
  quantity: number;
};

export type SubscriptionPlan = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  lifecycleStatus: SubscriptionPlanStatus;
  billingInterval: SubscriptionBillingInterval;
  intervalCount: number;
  customIntervalDays: number | null;
  currency: string;
  priceCents: number;
  productBindings: PlanProductBinding[] | unknown;
  gracePeriodDays: number;
  requiresReassessment: boolean;
  reassessmentIntervalCycles: number | null;
  archivedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SubscriptionPlanListResponse = {
  items: SubscriptionPlan[];
  total: number;
  statusCounts: Record<string, number>;
};

export type CreateSubscriptionPlanPayload = {
  name: string;
  slug?: string;
  description?: string | null;
  billingInterval: SubscriptionBillingInterval;
  intervalCount?: number;
  customIntervalDays?: number | null;
  currency?: string;
  priceCents: number;
  productBindings: PlanProductBinding[];
  gracePeriodDays?: number;
  requiresReassessment?: boolean;
  reassessmentIntervalCycles?: number | null;
};

export type UpdateSubscriptionPlanPayload = Partial<
  Omit<CreateSubscriptionPlanPayload, "slug">
>;

