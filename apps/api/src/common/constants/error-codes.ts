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
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
