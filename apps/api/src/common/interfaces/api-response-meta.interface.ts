/**
 * Success response metadata (docs/11 §8.1).
 *
 * Intentionally extensible for later fields (pagination, requestId, executionTime, etc.).
 * Phase 3B exposes only `correlationId`.
 */
export interface ApiResponseMeta {
  correlationId: string;
}
