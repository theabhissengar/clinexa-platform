/**
 * Additive development dataset for CRM/Guardian UI modernization testing.
 * Synthetic only — emails use @clinexa.test; never production PII.
 */

export const UI_DATASET_COUNT = 50;
export const UI_PATIENT_EMAIL_PREFIX = 'dev.ui.patient.';
export const UI_PATIENT_EMAIL_DOMAIN = 'clinexa.test';
export const UI_ORDER_NUMBER_PREFIX = 'ORD-UI-';
export const UI_RENEWAL_ORDER_NUMBER_PREFIX = 'ORD-UI-R-';
export const UI_SUBSCRIPTION_NUMBER_PREFIX = 'SUB-UI-';

export function uiPatientEmail(index1Based: number): string {
  const n = String(index1Based).padStart(3, '0');
  return `${UI_PATIENT_EMAIL_PREFIX}${n}@${UI_PATIENT_EMAIL_DOMAIN}`;
}

export function uiParentOrderNumber(index1Based: number): string {
  return `${UI_ORDER_NUMBER_PREFIX}${String(index1Based).padStart(4, '0')}`;
}

export function uiRenewalOrderNumber(index1Based: number): string {
  return `${UI_RENEWAL_ORDER_NUMBER_PREFIX}${String(index1Based).padStart(4, '0')}`;
}

export function uiSubscriptionNumber(index1Based: number): string {
  return `${UI_SUBSCRIPTION_NUMBER_PREFIX}${String(index1Based).padStart(3, '0')}`;
}

export function uiPhone(index1Based: number): string {
  const n = 5550200000 + index1Based;
  const s = String(n);
  return `+1${s.slice(0, 3)}${s.slice(3, 6)}${s.slice(6)}`;
}
