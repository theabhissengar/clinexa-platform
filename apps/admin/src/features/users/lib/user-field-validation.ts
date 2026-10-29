/**
 * Client-side field rules for Guardian + CRM user editors.
 * Notes and tags are intentionally excluded by callers.
 */

const PERSON_NAME_RE = /^[A-Za-zÀ-ÿ](?:[A-Za-zÀ-ÿ' .\-]*[A-Za-zÀ-ÿ.])?$/;
const DISPLAY_NAME_RE = /^[A-Za-zÀ-ÿ0-9](?:[A-Za-zÀ-ÿ0-9' .\-]*[A-Za-zÀ-ÿ0-9.])?$/;
const PHONE_RE = /^\d{7,15}$/;
const POSTAL_RE = /^[A-Za-z0-9][A-Za-z0-9\s\-]{1,19}$/;
const STRIPE_CUS_RE = /^cus_[A-Za-z0-9]{8,64}$/;
const REGION_CODE_RE = /^[A-Za-z0-9-]{1,16}$/;

export function sanitizePersonName(value: string): string {
  return value.replace(/[^A-Za-zÀ-ÿ' .\-]/g, "").slice(0, 80);
}

export function sanitizeDisplayName(value: string): string {
  return value.replace(/[^A-Za-zÀ-ÿ0-9' .\-]/g, "").slice(0, 80);
}

export function sanitizePhone(value: string): string {
  return value.replace(/\D/g, "").slice(0, 15);
}

export function sanitizePostalCode(value: string): string {
  return value.replace(/[^A-Za-z0-9\s\-]/g, "").slice(0, 20);
}

export function sanitizePlainText(value: string, max = 500): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").slice(0, max);
}

function optionalOk(
  value: string,
  check: (trimmed: string) => boolean,
): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  return check(trimmed);
}

export function isValidPersonName(value: string): boolean {
  return optionalOk(value, (v) => v.length <= 80 && PERSON_NAME_RE.test(v));
}

export function isValidDisplayName(value: string): boolean {
  return optionalOk(value, (v) => v.length <= 80 && DISPLAY_NAME_RE.test(v));
}

export function isValidPhone(value: string): boolean {
  return optionalOk(value, (v) => PHONE_RE.test(v));
}

export function isValidPostalCode(value: string): boolean {
  return optionalOk(value, (v) => POSTAL_RE.test(v));
}

export function isValidStripeCustomerId(value: string): boolean {
  return optionalOk(value, (v) => STRIPE_CUS_RE.test(v));
}

export function isValidRegionCode(value: string): boolean {
  return optionalOk(value, (v) => REGION_CODE_RE.test(v));
}

export function isValidBio(value: string): boolean {
  return value.length <= 2000;
}

export function isValidStaffText(value: string): boolean {
  return value.trim().length <= 120;
}

export function isValidAddressLine(value: string): boolean {
  return value.trim().length <= 120;
}

export function isValidCity(value: string): boolean {
  return optionalOk(
    value,
    (v) => v.length <= 80 && /^[A-Za-zÀ-ÿ0-9' .\-]+$/.test(v),
  );
}

export type UserProfileValidationInput = {
  firstName: string;
  lastName: string;
  displayName: string;
  phone: string;
  bio?: string;
  staffTitle?: string;
  staffCredentials?: string;
  region?: string;
  stripeCustomerIdLive?: string;
  stripeCustomerIdTest?: string;
};

export function validateUserProfileFields(
  input: UserProfileValidationInput,
): string | null {
  if (!isValidPersonName(input.firstName)) {
    return "First name may only include letters, spaces, hyphens, and apostrophes.";
  }
  if (!isValidPersonName(input.lastName)) {
    return "Last name may only include letters, spaces, hyphens, and apostrophes.";
  }
  if (!isValidDisplayName(input.displayName)) {
    return "Display name may only include letters, numbers, spaces, hyphens, and apostrophes.";
  }
  if (!isValidPhone(input.phone)) {
    return "Enter a valid phone number (7–15 digits).";
  }
  if (input.bio !== undefined && !isValidBio(input.bio)) {
    return "Bio must be 2000 characters or fewer.";
  }
  if (input.staffTitle !== undefined && !isValidStaffText(input.staffTitle)) {
    return "Staff title must be 120 characters or fewer.";
  }
  if (
    input.staffCredentials !== undefined &&
    !isValidStaffText(input.staffCredentials)
  ) {
    return "Credentials must be 120 characters or fewer.";
  }
  if (input.region !== undefined && !isValidRegionCode(input.region)) {
    return "Region code is invalid.";
  }
  if (
    input.stripeCustomerIdLive !== undefined &&
    !isValidStripeCustomerId(input.stripeCustomerIdLive)
  ) {
    return "Live Stripe customer id must look like cus_…";
  }
  if (
    input.stripeCustomerIdTest !== undefined &&
    !isValidStripeCustomerId(input.stripeCustomerIdTest)
  ) {
    return "Test Stripe customer id must look like cus_…";
  }
  return null;
}

export type AddressValidationInput = {
  firstName: string;
  lastName: string;
  line1: string;
  line2: string;
  city: string;
  postalCode: string;
};

export function validateAddressFields(
  label: string,
  address: AddressValidationInput,
): string | null {
  if (!isValidPersonName(address.firstName)) {
    return `${label}: first name is invalid.`;
  }
  if (!isValidPersonName(address.lastName)) {
    return `${label}: last name is invalid.`;
  }
  if (!isValidAddressLine(address.line1) || !isValidAddressLine(address.line2)) {
    return `${label}: address lines must be 120 characters or fewer.`;
  }
  if (!isValidCity(address.city)) {
    return `${label}: city is invalid.`;
  }
  if (!isValidPostalCode(address.postalCode)) {
    return `${label}: postal code is invalid.`;
  }
  return null;
}
