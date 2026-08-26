/**
 * Stable machine-readable API error codes (docs/11 §9).
 * Auth/domain codes are added when those modules land.
 */
export const ErrorCodes = {
  /** Unknown or invalid filter/sort/field (allowlist violation). */
  VAL_UNKNOWN_FIELD: 'ERR-VAL-001',
  /** Missing required field. */
  VAL_MISSING_FIELD: 'ERR-VAL-002',
  /** Invalid format (email, UUID, enum, type coercion). */
  VAL_INVALID_FORMAT: 'ERR-VAL-003',
  /** Resource not found. */
  RES_NOT_FOUND: 'ERR-RES-001',
  /** Unexpected server error. */
  SYS_UNEXPECTED: 'ERR-SYS-001',

  /** Unauthenticated / invalid session. */
  AUTH_UNAUTHENTICATED: 'ERR-AUTH-001',
  /** Invalid credentials. */
  AUTH_INVALID_CREDENTIALS: 'ERR-AUTH-002',
  /** Session expired (idle or absolute). */
  AUTH_SESSION_EXPIRED: 'ERR-AUTH-005',

  /** Missing permission. */
  AUTHZ_MISSING_PERMISSION: 'ERR-AUTHZ-001',
  /** Object scope denied (including cross-patient). */
  AUTHZ_OBJECT_SCOPE_DENIED: 'ERR-AUTHZ-002',
  /** CRM shell denied for patient/guest. */
  AUTHZ_CRM_SHELL_DENIED: 'ERR-AUTHZ-003',
  /** Clinical data denied for Marketing/Content. */
  AUTHZ_CLINICAL_DENIED: 'ERR-AUTHZ-004',

  /** Catalog publish safety failed (OR-14). */
  PRD_PUBLISH_UNSAFE: 'ERR-PRD-001',
  /** Invalid product lifecycle transition. */
  PRD_INVALID_TRANSITION: 'ERR-PRD-002',
  /** Destructive catalog action refused (retention). */
  PRD_RETENTION_BLOCK: 'ERR-PRD-003',
  /** Duplicate slug or SKU. */
  PRD_CONFLICT: 'ERR-PRD-004',

  /** Invalid user lifecycle transition. */
  USR_INVALID_TRANSITION: 'ERR-USR-001',
  /** Last-admin safeguard blocked the operation. */
  USR_LAST_ADMIN: 'ERR-USR-002',
  /** Email already registered. */
  USR_EMAIL_CONFLICT: 'ERR-USR-003',
  /** Profile field allowlist / self-escalation blocked. */
  USR_PROFILE_FORBIDDEN: 'ERR-USR-004',
  /** Password reset token invalid or expired. */
  AUTH_RESET_INVALID: 'ERR-AUTH-006',
  /** Account locked (abuse protection). */
  AUTH_ACCOUNT_LOCKED: 'ERR-AUTH-007',

  /** Invalid asset lifecycle transition. */
  AST_INVALID_TRANSITION: 'ERR-AST-001',
  /** Upload MIME or size policy violation. */
  AST_UPLOAD_REJECTED: 'ERR-AST-002',
  /** Upload session missing, expired, or invalid state. */
  AST_SESSION_INVALID: 'ERR-AST-003',
  /** Storage provider operation failed. */
  AST_STORAGE_FAILED: 'ERR-AST-004',

  /** Insufficient stock / oversell blocked. */
  INV_INSUFFICIENT: 'ERR-INV-001',
  /** Invalid reservation state transition. */
  INV_RESERVATION_INVALID: 'ERR-INV-002',
  /** Inventory tracking disabled for product type. */
  INV_NOT_TRACKED: 'ERR-INV-003',
  /** Warehouse constraint (default delete, inactive, missing). */
  INV_WAREHOUSE_INVALID: 'ERR-INV-004',
  /** Policy or validation failure. */
  INV_POLICY_VIOLATION: 'ERR-INV-005',

  /** Invalid order lifecycle transition. */
  ORD_INVALID_TRANSITION: 'ERR-ORD-001',
  /** Order not found or soft-deleted. */
  ORD_NOT_FOUND: 'ERR-ORD-002',
  /** Immutable order field/snapshot mutation refused. */
  ORD_IMMUTABLE: 'ERR-ORD-003',
  /** Invalid line item / quantity / catalog reference. */
  ORD_INVALID_ITEM: 'ERR-ORD-004',
  /** Totals validation failure. */
  ORD_INVALID_TOTALS: 'ERR-ORD-005',
  /** Concurrent lifecycle update conflict. */
  ORD_CONFLICT: 'ERR-ORD-006',
  /** Destructive Class D operation refused without authorization. */
  ORD_CLASS_D_DENIED: 'ERR-ORD-007',
  /** Edit field not allowed for context/status. */
  ORD_EDIT_FORBIDDEN: 'ERR-ORD-008',

  /** Subscription not cancellable in current state. */
  SUB_NOT_CANCELLABLE: 'ERR-SUB-001',
  /** Renewal charge failed (past-due/grace path). */
  SUB_RENEWAL_CHARGE_FAILED: 'ERR-SUB-002',
  /** Clinical reassessment required before renewal fulfill. */
  SUB_CLINICAL_REASSESSMENT: 'ERR-SUB-003',
  /** Plan not published / not bindable. */
  SUB_PLAN_NOT_BINDABLE: 'ERR-SUB-004',
  /** Illegal subscription lifecycle transition. */
  SUB_INVALID_TRANSITION: 'ERR-SUB-005',
  /** Duplicate renewal period (idempotency). */
  SUB_DUPLICATE_PERIOD: 'ERR-SUB-006',
  /** Pause/resume not allowed in current state. */
  SUB_PAUSE_RESUME_FORBIDDEN: 'ERR-SUB-007',
  /** CRM subscription create forbidden. */
  SUB_CRM_CREATE_FORBIDDEN: 'ERR-SUB-008',

  /** Payment authorization failed. */
  PAY_AUTHORIZATION_FAILED: 'ERR-PAY-001',
  /** Idempotency conflict / replay mismatch. */
  PAY_IDEMPOTENCY_CONFLICT: 'ERR-PAY-002',
  /** Webhook signature invalid. */
  PAY_WEBHOOK_INVALID: 'ERR-PAY-003',
  /** Refund not eligible under OR-11. */
  PAY_REFUND_INELIGIBLE: 'ERR-PAY-004',
  /** Saved payment method missing/invalid or ownership mismatch. */
  PAY_METHOD_INVALID: 'ERR-PAY-005',
  /** PSP timeout / unavailable (fail-safe). */
  PAY_PROVIDER_UNAVAILABLE: 'ERR-PAY-006',

  /** Coupon missing, inactive, expired, or not applicable. */
  CPN_INVALID: 'ERR-CPN-001',
  /** Coupon ineligible for cart scope / min order / dates. */
  CPN_INELIGIBLE: 'ERR-CPN-002',
  /** Redemption usage limit exceeded at capture (no payment rollback). */
  CPN_REDEMPTION_LIMIT: 'ERR-CPN-003',
  /** Coupon not found. */
  CPN_NOT_FOUND: 'ERR-CPN-004',
  /** Destructive coupon delete refused (redemption history retained). */
  CPN_RETENTION_BLOCK: 'ERR-CPN-005',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
