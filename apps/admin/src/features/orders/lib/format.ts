import type { OrderStatus } from "../types";

const ORDER_PRODUCT_STATUS_LABELS: Partial<Record<OrderStatus, string>> = {
  DRAFT: "Draft",
  PAYMENT_PENDING: "Pending Payment",
  AWAITING_CLINICAL_REVIEW: "Medical Review",
  CLINICAL_APPROVED: "Clinical Approved",
  CLINICAL_DECLINED: "Clinical Declined",
  AWAITING_FULFILLMENT: "Processing",
  FULFILLED: "Shipped",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
};

export function formatMoneyCents(cents: number, currency = "USD"): string {
  const amount = (cents / 100).toFixed(2);
  return currency === "USD" ? `$${amount}` : `${amount} ${currency}`;
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function customerLabel(order: {
  customerFirstName?: string | null;
  customerLastName?: string | null;
  customerEmail?: string | null;
}): string {
  const name = [order.customerFirstName, order.customerLastName]
    .filter(Boolean)
    .join(" ");
  return name || order.customerEmail || "—";
}

export function statusLabel(status: string): string {
  return status.replaceAll("_", " ");
}

export function productStatusLabel(status: OrderStatus | string): string {
  const mapped = ORDER_PRODUCT_STATUS_LABELS[status as OrderStatus];
  return mapped ?? statusLabel(status);
}
