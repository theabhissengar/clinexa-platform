/**
 * Deterministic development dataset for CRM Orders testing.
 * Synthetic only — emails use @clinexa.test; never production PII.
 */

export const DEV_PATIENT_COUNT = 150;
export const DEV_ORDER_COUNT = 100;
export const DEV_PATIENT_EMAIL_PREFIX = 'dev.patient.';
export const DEV_PATIENT_EMAIL_DOMAIN = 'clinexa.test';
export const DEV_ORDER_NUMBER_PREFIX = 'ORD-SEED-';

/** First names — synthetic development pool. */
export const DEV_FIRST_NAMES = [
  'Avery',
  'Blake',
  'Cameron',
  'Dakota',
  'Eden',
  'Finley',
  'Gray',
  'Harper',
  'Indigo',
  'Jordan',
  'Kai',
  'Logan',
  'Morgan',
  'Noah',
  'Oakley',
  'Parker',
  'Quinn',
  'Riley',
  'Sawyer',
  'Taylor',
  'Uma',
  'Val',
  'Wren',
  'Xander',
  'Yael',
  'Zion',
  'Alex',
  'Casey',
  'Drew',
  'Emery',
] as const;

/** Last names — synthetic development pool. */
export const DEV_LAST_NAMES = [
  'Anderson',
  'Brooks',
  'Chen',
  'Diaz',
  'Ellis',
  'Foster',
  'Garcia',
  'Hayes',
  'Iyer',
  'Jones',
  'Kim',
  'Lopez',
  'Miller',
  'Nguyen',
  'Ortiz',
  'Patel',
  'Quinn',
  'Reed',
  'Singh',
  'Turner',
  'Ueda',
  'Vargas',
  'Walsh',
  'Xu',
  'Young',
  'Zimmerman',
  'Baker',
  'Clark',
  'Davis',
  'Evans',
] as const;

export const DEV_CITIES = [
  { city: 'Austin', region: 'TX', postalCode: '78701' },
  { city: 'Denver', region: 'CO', postalCode: '80202' },
  { city: 'Seattle', region: 'WA', postalCode: '98101' },
  { city: 'Chicago', region: 'IL', postalCode: '60601' },
  { city: 'Atlanta', region: 'GA', postalCode: '30303' },
  { city: 'Phoenix', region: 'AZ', postalCode: '85001' },
  { city: 'Boston', region: 'MA', postalCode: '02108' },
  { city: 'Portland', region: 'OR', postalCode: '97201' },
  { city: 'Miami', region: 'FL', postalCode: '33101' },
  { city: 'Nashville', region: 'TN', postalCode: '37201' },
] as const;

/**
 * Target final statuses for ORD-SEED-0001..0100 (1-indexed slots).
 * Totals: DRAFT 8, PAYMENT_PENDING 12, AWAITING_CLINICAL_REVIEW 12,
 * CLINICAL_APPROVED 8, CLINICAL_DECLINED 6, AWAITING_FULFILLMENT 18,
 * FULFILLED 20, CANCELLED 10, REFUNDED 6 = 100.
 */
export type DevOrderStatusPlan =
  | 'DRAFT'
  | 'PAYMENT_PENDING'
  | 'AWAITING_CLINICAL_REVIEW'
  | 'CLINICAL_APPROVED'
  | 'CLINICAL_DECLINED'
  | 'AWAITING_FULFILLMENT'
  | 'FULFILLED'
  | 'CANCELLED'
  | 'REFUNDED';

export function statusForOrderIndex(index1Based: number): DevOrderStatusPlan {
  if (index1Based <= 8) return 'DRAFT';
  if (index1Based <= 20) return 'PAYMENT_PENDING';
  if (index1Based <= 32) return 'AWAITING_CLINICAL_REVIEW';
  if (index1Based <= 40) return 'CLINICAL_APPROVED';
  if (index1Based <= 46) return 'CLINICAL_DECLINED';
  if (index1Based <= 64) return 'AWAITING_FULFILLMENT';
  if (index1Based <= 84) return 'FULFILLED';
  if (index1Based <= 94) return 'CANCELLED';
  return 'REFUNDED';
}

export function orderTypeForIndex(index1Based: number): {
  orderType: 'ONE_TIME' | 'SUBSCRIPTION_INITIAL' | 'SUBSCRIPTION_RENEWAL';
  subscriptionId: string | null;
} {
  // Deterministic opaque UUID-like refs (not real Subscription rows).
  const opaqueSubId = (n: number) =>
    `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

  if (index1Based % 10 === 0) {
    return {
      orderType: 'SUBSCRIPTION_RENEWAL',
      subscriptionId: opaqueSubId(index1Based),
    };
  }
  if (index1Based % 5 === 0) {
    return {
      orderType: 'SUBSCRIPTION_INITIAL',
      subscriptionId: opaqueSubId(index1Based),
    };
  }
  return { orderType: 'ONE_TIME', subscriptionId: null };
}

export function patientEmail(index1Based: number): string {
  const n = String(index1Based).padStart(3, '0');
  return `${DEV_PATIENT_EMAIL_PREFIX}${n}@${DEV_PATIENT_EMAIL_DOMAIN}`;
}

export function orderNumber(index1Based: number): string {
  return `${DEV_ORDER_NUMBER_PREFIX}${String(index1Based).padStart(4, '0')}`;
}
