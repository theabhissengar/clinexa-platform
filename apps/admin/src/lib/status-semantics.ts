/**
 * Additive UI status semantics for Clinexa (Phase 5A).
 *
 * This registry does not change backend enums, lifecycle behavior, or
 * feature format helpers. Pages continue to use existing labels until 5E/5F.
 *
 * Bucket notes for ambiguous operational states:
 * - Processing / Medical Review / Shipped (Fulfilled) → info (in-progress, not success)
 * - Completed / Captured / Approved / Active / Published → positive
 * - Paused / On Hold / Declined hold → hold
 * - Past Due / Pending Payment / Pending verification / Review queues needing attention → warning
 * - Failed / Cancelled / Declined / Expired / Suspended → destructive
 * - Refunded / Migrated / Archived / Deleted / Voided → admin
 *
 * Product lifecycle UNPUBLISHED is registered as "Unpublished". Guardian
 * products currently display "Private" for the same enum — pass `label` on
 * StatusBadge in 5E to preserve that product-specific copy.
 */

export const STATUS_TONES = [
  "neutral",
  "info",
  "positive",
  "warning",
  "destructive",
  "hold",
  "admin",
] as const;

export type StatusTone = (typeof STATUS_TONES)[number];

export type StatusSemantics = {
  value: string;
  tone: StatusTone;
  label: string;
  known: boolean;
};

type StatusEntry = {
  tone: StatusTone;
  label: string;
};

const STATUS_REGISTRY: Record<string, StatusEntry> = {
  // Orders — labels from features/orders/lib/format.ts productStatusLabel
  DRAFT: { tone: "neutral", label: "Draft" },
  PAYMENT_PENDING: { tone: "warning", label: "Pending Payment" },
  AWAITING_CLINICAL_REVIEW: { tone: "info", label: "Medical Review" },
  CLINICAL_APPROVED: { tone: "positive", label: "Clinical Approved" },
  CLINICAL_DECLINED: { tone: "destructive", label: "Clinical Declined" },
  AWAITING_FULFILLMENT: { tone: "info", label: "Processing" },
  FULFILLED: { tone: "info", label: "Shipped" },
  CANCELLED: { tone: "destructive", label: "Cancelled" },
  REFUNDED: { tone: "admin", label: "Refunded" },

  // Subscriptions — labels from features/subscriptions/lib/format.ts
  PENDING_SETUP: { tone: "neutral", label: "Pending Setup" },
  ACTIVE: { tone: "positive", label: "Active" },
  PAUSED: { tone: "hold", label: "On Hold" },
  PAST_DUE: { tone: "warning", label: "Past Due" },
  MIGRATED: { tone: "admin", label: "Subscription Migrated" },
  EXPIRED: { tone: "destructive", label: "Expired" },
  COMPLETED: { tone: "positive", label: "Completed" },
  NONE: { tone: "neutral", label: "None" },
  REASSESSMENT_REQUIRED: { tone: "warning", label: "Reassessment Required" },
  DECLINED_HOLD: { tone: "hold", label: "Declined Hold" },

  // Payments
  PENDING: { tone: "warning", label: "Pending" },
  AUTHORIZED_OR_CAPTURED: { tone: "positive", label: "Authorized or Captured" },
  FAILED: { tone: "destructive", label: "Failed" },
  INITIATED: { tone: "warning", label: "Initiated" },
  PENDING_AUTHORIZATION: { tone: "warning", label: "Pending Authorization" },
  AUTHORIZED: { tone: "positive", label: "Authorized" },
  AUTHORIZATION_FAILED: { tone: "destructive", label: "Authorization Failed" },
  CAPTURE_PENDING: { tone: "warning", label: "Capture Pending" },
  CAPTURED: { tone: "positive", label: "Captured" },
  CAPTURE_FAILED: { tone: "destructive", label: "Capture Failed" },
  VOIDED: { tone: "admin", label: "Voided" },
  REFUND_PENDING: { tone: "warning", label: "Refund Pending" },

  // Users
  PENDING_VERIFICATION: { tone: "warning", label: "Pending" },
  SUSPENDED: { tone: "destructive", label: "Suspended" },
  INACTIVE: { tone: "neutral", label: "Inactive" },
  ARCHIVED: { tone: "admin", label: "Archived" },
  DELETED: { tone: "admin", label: "Deleted" },

  // Catalog / plans / categories
  REVIEW: { tone: "info", label: "Review" },
  PUBLISHED: { tone: "positive", label: "Published" },
  UNPUBLISHED: { tone: "neutral", label: "Unpublished" },

  // Assets
  UPLOADED: { tone: "info", label: "Uploaded" },

  // Coupon redemptions
  RECORDED: { tone: "positive", label: "Recorded" },
  FAILED_LIMIT: { tone: "destructive", label: "Failed Limit" },
};

function unknownLabel(status: string): string {
  const humanized = status.replaceAll("_", " ").replaceAll(/\s+/g, " ").trim();
  if (!humanized) {
    return status;
  }
  if (humanized === status) {
    return status;
  }
  return `${humanized} (${status})`;
}

export function resolveStatusSemantics(status: string): StatusSemantics {
  const value = status.trim();
  const entry = STATUS_REGISTRY[value];
  if (entry) {
    return {
      value,
      tone: entry.tone,
      label: entry.label,
      known: true,
    };
  }
  return {
    value,
    tone: "neutral",
    label: unknownLabel(value || status),
    known: false,
  };
}

export const STATUS_TONE_EXAMPLES: ReadonlyArray<{
  status: string;
  tone: StatusTone;
}> = [
  { status: "DRAFT", tone: "neutral" },
  { status: "AWAITING_CLINICAL_REVIEW", tone: "info" },
  { status: "ACTIVE", tone: "positive" },
  { status: "PAST_DUE", tone: "warning" },
  { status: "CANCELLED", tone: "destructive" },
  { status: "PAUSED", tone: "hold" },
  { status: "REFUNDED", tone: "admin" },
];

/**
 * Lightweight verification used by the unlisted /dev/design-system page.
 * Admin has no unit-test runner; this keeps the registry honest without adding Jest/Vitest.
 */
export function assertStatusSemantics(): string[] {
  const errors: string[] = [];
  const seen = new Set<StatusTone>();

  for (const example of STATUS_TONE_EXAMPLES) {
    const resolved = resolveStatusSemantics(example.status);
    seen.add(resolved.tone);
    if (!resolved.known) {
      errors.push(`${example.status} should be a known status`);
    }
    if (resolved.tone !== example.tone) {
      errors.push(
        `${example.status} expected tone ${example.tone}, got ${resolved.tone}`,
      );
    }
    if (!resolved.label.trim()) {
      errors.push(`${example.status} is missing a visible label`);
    }
  }

  for (const tone of STATUS_TONES) {
    if (!seen.has(tone)) {
      errors.push(`No example covers tone ${tone}`);
    }
  }

  const unknown = resolveStatusSemantics("NOT_A_REAL_STATUS");
  if (unknown.known || unknown.tone !== "neutral") {
    errors.push("Unknown statuses must fall back to neutral");
  }
  if (!unknown.label.includes("NOT_A_REAL_STATUS")) {
    errors.push("Unknown status fallback must preserve the original value");
  }
  if (!unknown.label.trim()) {
    errors.push("Unknown status fallback must include a visible label");
  }

  const medical = resolveStatusSemantics("AWAITING_CLINICAL_REVIEW");
  if (medical.label !== "Medical Review") {
    errors.push("Medical Review label drifted from existing order copy");
  }

  const shipped = resolveStatusSemantics("FULFILLED");
  if (shipped.label !== "Shipped") {
    errors.push("Shipped label drifted from existing order copy");
  }

  const hold = resolveStatusSemantics("PAUSED");
  if (hold.label !== "On Hold") {
    errors.push("On Hold label drifted from existing subscription copy");
  }

  return errors;
}
