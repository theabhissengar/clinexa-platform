import { SetMetadata } from '@nestjs/common';

export const SKIP_TRANSFORM_KEY = 'skipTransform';

/**
 * Opt out of the global success-response envelope (e.g. health probes).
 */
export const SkipTransform = () => SetMetadata(SKIP_TRANSFORM_KEY, true);
