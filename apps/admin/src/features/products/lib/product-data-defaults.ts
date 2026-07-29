import type {
  ProductAttributeDef,
  ProductType,
  StripeGatewayPref,
} from "../types";

export const PRODUCT_TYPE_OPTIONS: Array<{ value: ProductType; label: string }> =
  [
    { value: "STANDARD", label: "Simple product" },
    { value: "VARIABLE", label: "Variable product" },
    { value: "SIMPLE_SUBSCRIPTION", label: "Simple subscription" },
    { value: "VARIABLE_SUBSCRIPTION", label: "Variable subscription" },
    { value: "BUNDLE", label: "Bundle" },
    { value: "KIT", label: "Kit" },
    { value: "DIGITAL", label: "Digital" },
  ];

export const DEFAULT_STRIPE_GATEWAYS: StripeGatewayPref[] = [
  {
    id: "affirm",
    label: "Affirm (Stripe) by Payment Plugins",
    enabled: false,
    sortOrder: 0,
  },
  {
    id: "link",
    label: "Link Checkout (Stripe) by Payment Plugins",
    enabled: false,
    sortOrder: 1,
  },
  {
    id: "klarna",
    label: "Klarna (Stripe) by Payment Plugins",
    enabled: false,
    sortOrder: 2,
  },
  {
    id: "payment_request",
    label: "Payment Request (Stripe) by Payment Plugins",
    enabled: true,
    chargeType: "Capture",
    sortOrder: 3,
  },
  {
    id: "afterpay",
    label: "Afterpay (Stripe) by Payment Plugins",
    enabled: false,
    sortOrder: 4,
  },
  {
    id: "apple_pay",
    label: "Apple Pay (Stripe) by Payment Plugins",
    enabled: true,
    chargeType: "Capture",
    sortOrder: 5,
  },
  {
    id: "google_pay",
    label: "Google Pay (Stripe) by Payment Plugins",
    enabled: true,
    chargeType: "Capture",
    sortOrder: 6,
  },
];

export function normalizeAttributes(
  value: unknown,
): ProductAttributeDef[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        const row = item as ProductAttributeDef;
        return {
          name: row.name ?? "",
          values: Array.isArray(row.values) ? row.values : [],
          forVariation: Boolean(row.forVariation),
          din: row.din ?? "",
          dose: row.dose ?? "",
        };
      })
      .filter((row) => row.name);
  }
  return [];
}

export function parseDecimalInput(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function decimalToInput(value: string | number | null | undefined) {
  if (value == null || value === "") return "";
  return String(value);
}
