import 'express';

declare global {
  namespace Express {
    interface Request {
      /** Resolved request correlation id (set by CorrelationIdMiddleware). */
      correlationId?: string;
    }
  }
}

export {};
