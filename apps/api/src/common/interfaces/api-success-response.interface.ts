import type { ApiResponseMeta } from './api-response-meta.interface';

/**
 * Standard success envelope (docs/11 §8.1).
 * correlationId in meta is deferred to Phase 3B.
 */
export interface ApiSuccessResponse<T> {
  data: T;
  meta: ApiResponseMeta;
}
