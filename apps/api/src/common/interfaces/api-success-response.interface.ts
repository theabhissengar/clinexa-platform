import type { ApiResponseMeta } from './api-response-meta.interface';

/**
 * Standard success envelope (docs/11 §8.1).
 */
export interface ApiSuccessResponse<T> {
  data: T;
  meta: ApiResponseMeta;
}
