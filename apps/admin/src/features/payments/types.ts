export type PaymentStatus =
  | "PENDING"
  | "AUTHORIZED_OR_CAPTURED"
  | "FAILED"
  | "REFUNDED";

export type PaymentLifecycleState =
  | "INITIATED"
  | "PENDING_AUTHORIZATION"
  | "AUTHORIZED"
  | "AUTHORIZATION_FAILED"
  | "CAPTURE_PENDING"
  | "CAPTURED"
  | "CAPTURE_FAILED"
  | "VOIDED"
  | "REFUND_PENDING"
  | "REFUNDED"
  | "CANCELLED";

export type PaymentListItem = {
  id: string;
  orderId: string | null;
  subscriptionId: string | null;
  amountCents: number;
  currency: string;
  status: PaymentStatus;
  lifecycleState: PaymentLifecycleState;
  purpose: string;
  provider: string;
  createdAt: string;
  updatedAt: string;
  order: {
    orderNumber: string;
    status: string;
    patientUserId: string;
    customerFirstName: string | null;
    customerLastName: string | null;
  } | null;
};

export type PaymentListResponse = {
  items: PaymentListItem[];
  total: number;
  skip: number;
  take: number;
};

export type PaymentDetail = {
  id: string;
  createdAt: string;
  updatedAt: string;
  purpose: string;
  amountCents: number;
  currency: string;
  status: PaymentStatus;
  lifecycleState: PaymentLifecycleState;
  provider: string;
  providerPaymentRef: string | null;
  providerAuthorizationRef: string | null;
  providerCaptureRef: string | null;
  idempotencyKey: string;
  lastErrorCode: string | null;
  refundedCents: number;
  refundableCents: number;
  order: {
    id: string;
    orderNumber: string;
    status: string;
    totalCents: number;
    currency: string;
  } | null;
  subscription: { id: string; status: string } | null;
  patient: {
    userId: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  } | null;
  timeline: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    source: string;
    reason: string | null;
    createdAt: string;
  }>;
  refunds: Array<{
    id: string;
    amountCents: number;
    status: string;
    reason: string | null;
    actorUserId: string | null;
    providerRefundRef: string | null;
    createdAt: string;
  }>;
  webhookEvents: Array<{
    id: string;
    eventType: string;
    providerEventId: string;
    appliedAt: string | null;
    createdAt: string;
  }>;
};

export type ProviderConfig = {
  provider: string;
  mode: "sandbox" | "live";
  capabilities: string[];
  webhookEndpointUrl: string;
};
