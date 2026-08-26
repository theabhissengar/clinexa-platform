export type OrderStatus =
  | "DRAFT"
  | "PAYMENT_PENDING"
  | "AWAITING_CLINICAL_REVIEW"
  | "CLINICAL_APPROVED"
  | "CLINICAL_DECLINED"
  | "AWAITING_FULFILLMENT"
  | "FULFILLED"
  | "CANCELLED"
  | "REFUNDED";

export type OrderType = "ONE_TIME" | "SUBSCRIPTION_INITIAL" | "SUBSCRIPTION_RENEWAL";

export type OrderListItem = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  orderType: OrderType;
  patientUserId: string;
  customerFirstName: string | null;
  customerLastName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  currency: string;
  totalCents: number;
  paymentStatusSummary: string | null;
  subscriptionId: string | null;
  requiresClinicalReview: boolean;
  isRxOrder: boolean;
  trackingNumber: string | null;
  shippedAt: string | null;
  archivedAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrderListResponse = {
  items: OrderListItem[];
  total: number;
  statusCounts: Record<string, number>;
};

export type OrderAddress = {
  id: string;
  kind: "SHIPPING" | "BILLING";
  fullName: string | null;
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  postalCode: string | null;
  country: string;
  phone: string | null;
};

export type OrderItem = {
  id: string;
  productId: string;
  variantId: string;
  productName: string;
  sku: string;
  productType: string;
  isRxEligible: boolean;
  quantity: number;
  unitPriceCents: number;
  salePriceCents: number;
  taxCents: number;
  discountCents: number;
  lineSubtotalCents: number;
  lineTotalCents: number;
};

export type OrderPatientRef = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  phone: string | null;
  status: string;
};

export type OrderAdjustment = {
  id: string;
  kind: string;
  amountCents: number;
  reason: string | null;
  actorUserId: string | null;
  paymentRef: string | null;
  createdAt: string;
};

export type OrderDetail = OrderListItem & {
  discountTotalCents: number;
  shippingTotalCents: number;
  taxTotalCents: number;
  subtotalCents: number;
  adjustmentTotalCents: number;
  refundedTotalCents: number;
  paymentIntentId: string | null;
  latestPaymentId: string | null;
  reservationId: string | null;
  consultationId: string | null;
  prescriptionId: string | null;
  questionnaireResponseId: string | null;
  questionnaireVersionId: string | null;
  carrier: string | null;
  adminTags?: unknown;
  reconciliationFlags?: unknown;
  items: OrderItem[];
  addresses: OrderAddress[];
  adjustments?: OrderAdjustment[];
  patient: OrderPatientRef;
  allowedNextStatuses: OrderStatus[];
  canCancel: boolean;
  canFulfill: boolean;
};

export type OrderNote = {
  id: string;
  orderId: string;
  authorUserId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type OrderStatusHistory = {
  id: string;
  orderId: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  actorUserId: string | null;
  source: string;
  reason: string | null;
  metadata: unknown;
  createdAt: string;
};

export type OrderActivity = {
  id: string;
  orderId: string;
  actorUserId: string | null;
  kind: string;
  summary: string;
  metadata: unknown;
  createdAt: string;
};

export type UpdateCrmOrderPayload = {
  trackingNumber?: string | null;
  carrier?: string | null;
  shippedAt?: string | null;
  shippingPhone?: string | null;
};

export type UpdateAdminOrderPayload = UpdateCrmOrderPayload & {
  adminTags?: Record<string, unknown> | null;
  reconciliationFlags?: Record<string, unknown> | null;
};

export type CreateAdminOrderPayload = {
  patientUserId: string;
  lines: Array<{
    variantId: string;
    quantity: number;
    discountCents?: number;
    taxCents?: number;
  }>;
  shippingAddress: {
    fullName?: string;
    line1: string;
    line2?: string;
    city: string;
    region?: string;
    postalCode?: string;
    country?: string;
    phone?: string;
  };
  billingAddress: {
    fullName?: string;
    line1: string;
    line2?: string;
    city: string;
    region?: string;
    postalCode?: string;
    country?: string;
    phone?: string;
  };
  orderType?: OrderType;
  shippingTotalCents?: number;
  discountTotalCents?: number;
  taxTotalCents?: number;
  couponCode?: string;
  initialStatus?: "DRAFT" | "PAYMENT_PENDING";
};
