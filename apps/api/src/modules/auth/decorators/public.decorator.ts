import { SetMetadata } from '@nestjs/common';

import { IS_PUBLIC_KEY } from '../constants/auth.constants';

/** Marks a route as publicly accessible (no JWT required). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
