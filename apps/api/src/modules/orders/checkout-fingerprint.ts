import { createHash } from 'crypto';

import type { OrderAddressInput } from './order.types';

export type CheckoutFingerprintInput = {
  userId: string;
  lines: Array<{ variantId: string; quantity: number }>;
  shippingAddress: OrderAddressInput;
  billingAddress: OrderAddressInput;
  paymentMethodId: string | null;
};

function normStr(value: string | null | undefined): string {
  return (value ?? '').trim();
}

function normCountry(value: string | null | undefined): string {
  return normStr(value).toUpperCase() || 'US';
}

function canonicalizeAddress(address: OrderAddressInput) {
  return {
    fullName: normStr(address.fullName),
    line1: normStr(address.line1),
    line2: normStr(address.line2),
    city: normStr(address.city),
    region: normStr(address.region),
    postalCode: normStr(address.postalCode),
    country: normCountry(address.country),
    phone: normStr(address.phone),
  };
}

/**
 * Canonical checkout fingerprint payload (Phase 6D).
 * Stable SHA-256 — not derived from mutable OrderAddress rows after create.
 */
export function computeCheckoutRequestHash(
  input: CheckoutFingerprintInput,
): string {
  const lines = [...input.lines]
    .map((l) => ({
      variantId: l.variantId.trim(),
      quantity: l.quantity,
    }))
    .sort((a, b) =>
      a.variantId === b.variantId
        ? a.quantity - b.quantity
        : a.variantId.localeCompare(b.variantId),
    );

  const payload = {
    op: 'checkout',
    userId: input.userId.trim(),
    lines,
    shippingAddress: canonicalizeAddress(input.shippingAddress),
    billingAddress: canonicalizeAddress(input.billingAddress),
    paymentMethodId: input.paymentMethodId?.trim() || null,
  };

  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function checkoutOrderIdempotencyKey(
  userId: string,
  clientKey: string,
): string {
  return `checkout:user:${userId}:${clientKey}`;
}

export function checkoutAuthorizeIdempotencyKey(
  userId: string,
  clientKey: string,
): string {
  return `checkout:user:${userId}:${clientKey}:authorize`;
}

export function reauthAuthorizeIdempotencyKey(
  userId: string,
  orderId: string,
  clientKey: string,
): string {
  return `reauth:user:${userId}:order:${orderId}:${clientKey}`;
}
