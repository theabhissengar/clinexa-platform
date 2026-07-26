import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

/**
 * Extracts the authenticated principal from the request.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.user as AuthenticatedUser;
  },
);
