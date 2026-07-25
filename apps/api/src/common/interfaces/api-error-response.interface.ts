/**
 * Standard error envelope (docs/11 §8.2–8.10, NFR-116).
 * correlationId is deferred to Phase 3B.
 */
export interface ApiErrorResponse {
  code: string;
  message: string;
  details?: unknown;
}
