export type UserAddressForm = {
  firstName: string;
  lastName: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
};

export const EMPTY_USER_ADDRESS: UserAddressForm = {
  firstName: "",
  lastName: "",
  line1: "",
  line2: "",
  city: "",
  region: "",
  postalCode: "",
  country: "",
};

/** Shared with CRM + Guardian so address JSON stays in sync. */
export const ADDRESS_REGION_OPTIONS = [
  { value: "", label: "Select region" },
  { value: "ON", label: "Ontario" },
  { value: "BC", label: "British Columbia" },
  { value: "AB", label: "Alberta" },
  { value: "QC", label: "Quebec" },
  { value: "NS", label: "Nova Scotia" },
  { value: "MB", label: "Manitoba" },
  { value: "SK", label: "Saskatchewan" },
  { value: "CA-OTHER", label: "Other (Canada)" },
  { value: "US-CA", label: "California" },
  { value: "US-NY", label: "New York" },
  { value: "US-TX", label: "Texas" },
  { value: "US-OTHER", label: "Other (US)" },
] as const;

export const ADDRESS_COUNTRY_OPTIONS = [
  { value: "", label: "Select country" },
  { value: "CA", label: "Canada" },
  { value: "US", label: "United States" },
  { value: "GB", label: "United Kingdom" },
  { value: "AU", label: "Australia" },
  { value: "IN", label: "India" },
  { value: "OTHER", label: "Other" },
] as const;

export function addressFromJson(
  value: Record<string, unknown> | object | null | undefined,
): UserAddressForm {
  if (!value || typeof value !== "object") return { ...EMPTY_USER_ADDRESS };
  const record = value as Record<string, unknown>;
  return {
    firstName: String(record.firstName ?? ""),
    lastName: String(record.lastName ?? ""),
    line1: String(record.line1 ?? ""),
    line2: String(record.line2 ?? ""),
    city: String(record.city ?? ""),
    region: String(record.region ?? ""),
    postalCode: String(record.postalCode ?? ""),
    country: String(record.country ?? ""),
  };
}

export function addressToJson(
  address: UserAddressForm,
): {
  firstName?: string;
  lastName?: string;
  line1?: string;
  line2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
} | null {
  const entries = Object.entries(address).filter(([, v]) => v.trim() !== "");
  if (!entries.length) return null;
  return Object.fromEntries(entries);
}
