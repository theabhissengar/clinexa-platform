import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

import { CORRELATION_ID_HEADER } from '../constants/http-headers';
import { resolveCorrelationId } from '../utils/correlation-id.util';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const correlationId = resolveCorrelationId(
      req.headers[CORRELATION_ID_HEADER],
    );
    req.correlationId = correlationId;
    res.setHeader(CORRELATION_ID_HEADER, correlationId);
    next();
  }
}
