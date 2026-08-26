import {
  OrderAdjustmentKind,
  OrderStatus,
  OrderType,
} from '../../../generated/prisma';

/** Application context for field allowlists (not AuthZ — API layer adds permissions). */
export type OrderEditContext = 'crm' | 'guardian';

export type OrderAddressInput = {
  fullName?: string | null;
  line1: string;
  line2?: string | null;
  city: string;
  region?: string | null;
  postalCode?: string | null;
  country?: string;
  phone?: string | null;
};

export type CreateOrderLineInput = {
  variantId: string;
  quantity: number;
  /**
   * Optional staff/manual line discount (cents). Not a coupon promotion input.
   * Ignored when `couponCode` is supplied — Promotions owns coupon discounts.
   */
  discountCents?: number;
  /** Optional explicit line tax allocation (cents). Default 0. */
  taxCents?: number;
};

export type CreateOrderInput = {
  patientUserId: string;
  lines: CreateOrderLineInput[];
  shippingAddress: OrderAddressInput;
  billingAddress: OrderAddressInput;
  /** Override customer snapshot; defaults derived from User when omitted. */
  customer?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  orderType?: OrderType;
  subscriptionId?: string | null;
  /** Order-level amounts in cents (server validates; never trusted as grand total). */
  shippingTotalCents?: number;
  /**
   * Optional staff/manual order discount (cents). Pre-existing P13 pricing field,
   * not coupon promotion input. When `couponCode` is set, Promotions totals win.
   */
  discountTotalCents?: number;
  taxTotalCents?: number;
  currency?: string;
  /**
   * Initial status. Admin path typically DRAFT; checkout finalize uses PAYMENT_PENDING.
   * Defaults to DRAFT.
   */
  initialStatus?: Extract<OrderStatus, 'DRAFT' | 'PAYMENT_PENDING'>;
  actorUserId?: string | null;
  source?: string;
  /** Optional opaque coupon code — Promotions evaluates; Orders never inspects coupon rules. */
  couponCode?: string | null;
  /** Optional idempotency key (unique). Replay returns the existing order. */
  idempotencyKey?: string | null;
};

/** Renewal / historical create — lines come from snapshots, not live catalog prices. */
export type SnapshotOrderLineInput = {
  productId: string;
  variantId: string;
  productName: string;
  sku: string;
  productType: string;
  isRxEligible: boolean;
  catalogMetadata?: unknown;
  quantity: number;
  unitPriceCents: number;
  salePriceCents: number;
  currency?: string;
  discountCents?: number;
  taxCents?: number;
};

export type CreateOrderFromSnapshotsInput = {
  patientUserId: string;
  lines: SnapshotOrderLineInput[];
  shippingAddress: OrderAddressInput;
  billingAddress: OrderAddressInput;
  customer?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  orderType: OrderType;
  subscriptionId: string;
  shippingTotalCents?: number;
  discountTotalCents?: number;
  taxTotalCents?: number;
  currency?: string;
  initialStatus?: Extract<OrderStatus, 'DRAFT' | 'PAYMENT_PENDING'>;
  actorUserId?: string | null;
  source?: string;
  /** Required for renewal: renewal:{subscriptionId}:{billingPeriodKey} */
  idempotencyKey: string;
};

export type TransitionOrderInput = {
  orderId: string;
  toStatus: OrderStatus;
  actorUserId?: string | null;
  source: string;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  /**
   * Expected current status for optimistic concurrency.
   * When omitted, the loaded order status is used as the expected value.
   */
  expectedStatus?: OrderStatus;
};

/**
 * Opaque clinical correlation refs only (P14g). Not a Consultation SoT write.
 */
export type AttachClinicalRefsInput = {
  orderId: string;
  consultationId?: string | null;
  prescriptionId?: string | null;
  questionnaireResponseId?: string | null;
  questionnaireVersionId?: string | null;
  actorUserId?: string | null;
  source?: string;
};

export type UpdateOrderFieldsInput = {
  orderId: string;
  context: OrderEditContext;
  actorUserId?: string | null;
  trackingNumber?: string | null;
  carrier?: string | null;
  shippedAt?: Date | null;
  adminTags?: unknown;
  reconciliationFlags?: unknown;
  /** Limited shipping contact assist (phone on shipping address) when policy allows. */
  shippingPhone?: string | null;
};

export type AddOrderNoteInput = {
  orderId: string;
  authorUserId: string;
  body: string;
};

export type AddOrderAdjustmentInput = {
  orderId: string;
  kind?: OrderAdjustmentKind;
  amountCents: number;
  reason?: string | null;
  actorUserId?: string | null;
  paymentRef?: string | null;
  metadata?: Record<string, unknown> | null;
  /** Required true — financial adjustments are Class D / Correct path. */
  classDAuthorized: true;
};

export type ClassDOrderInput = {
  orderId: string;
  actorUserId?: string | null;
  reason?: string | null;
  /** Must be true — domain refuses otherwise. */
  classDAuthorized: true;
};

/**
 * Administrative Override (PERM-ORD-014 / Class D).
 * Forces a status change that may bypass the normal transition graph.
 * Requires an explicit non-empty reason. Never silent.
 */
export type OverrideOrderInput = {
  orderId: string;
  toStatus: OrderStatus;
  reason: string;
  actorUserId?: string | null;
  metadata?: Record<string, unknown> | null;
  classDAuthorized: true;
};
