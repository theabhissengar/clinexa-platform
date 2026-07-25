import { randomUUID } from 'node:crypto';

import { CORRELATION_ID_MAX_LENGTH } from '../constants/http-headers';

/** Printable ASCII: 0x20–0x7E (no control characters). */
const PRINTABLE_ASCII = /^[\x20-\x7E]+$/;

/**
 * Returns true when the client-supplied correlation id is acceptable.
 * Empty / whitespace-only values are invalid. Valid values are not trimmed.
 */
export function isValidCorrelationId(value: string): boolean {
  if (value.length === 0 || /^\s*$/.test(value)) {
    return false;
  }

  if (value.length > CORRELATION_ID_MAX_LENGTH) {
    return false;
  }

  return PRINTABLE_ASCII.test(value);
}

/**
 * Resolves a correlation id from an optional header value.
 * Invalid or missing values are replaced with a new UUID.
 */
export function resolveCorrelationId(
  headerValue: string | string[] | undefined,
): string {
  const candidate = Array.isArray(headerValue) ? headerValue[0] : headerValue;

  if (typeof candidate === 'string' && isValidCorrelationId(candidate)) {
    return candidate;
  }

  return randomUUID();
}

export function getCorrelationId(req: { correlationId?: string }): string {
  return req.correlationId ?? randomUUID();
}
