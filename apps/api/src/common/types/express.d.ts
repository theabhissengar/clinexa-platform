import 'express';

import type { AuthenticatedUser } from '../../modules/auth/interfaces/authenticated-user.interface';

declare global {
  namespace Express {
    interface Request {
      /** Resolved request correlation id (set by CorrelationIdMiddleware). */
      correlationId?: string;
      /** Authenticated principal (set by JwtStrategy). */
      user?: AuthenticatedUser;
    }
  }
}

export {};
