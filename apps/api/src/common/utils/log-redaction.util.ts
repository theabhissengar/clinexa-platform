const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'proxy-authorization',
  'x-api-key',
  'x-auth-token',
]);

/**
 * Returns a shallow copy of headers with sensitive values redacted (NFR-075).
 * HTTP request logs in Phase 3B are metadata-only and should not dump headers;
 * this helper is available for any future header logging.
 */
export function redactHeaders(
  headers: Record<string, unknown>,
): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (SENSITIVE_HEADER_NAMES.has(key.toLowerCase())) {
      redacted[key] = '[REDACTED]';
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}
