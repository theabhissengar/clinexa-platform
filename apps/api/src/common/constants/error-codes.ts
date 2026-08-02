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
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
