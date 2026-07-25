/**
 * Standard error envelope (docs/11 §8.2–8.10, NFR-116).
 */
export interface ApiErrorResponse {
  code: string;
  message: string;
  correlationId: string;
  details?: unknown;
}
