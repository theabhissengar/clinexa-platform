import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';

import { getCorrelationId } from '../utils/correlation-id.util';

export interface HttpLogObject {
  type: 'http';
  method: string;
  url: string;
  statusCode: number;
  durationMs: number;
  correlationId: string;
}

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  constructor(private readonly configService: ConfigService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const startedAt = Date.now();

    res.on('finish', () => {
      this.emitHttpLog(req, res, startedAt);
    });

    return next.handle();
  }

  private emitHttpLog(req: Request, res: Response, startedAt: number): void {
    const url = req.originalUrl || req.url;
    const logHealthRequests =
      this.configService.get<boolean>('app.logHealthRequests') ?? false;

    if (!logHealthRequests && this.isHealthPath(url)) {
      return;
    }

    const payload: HttpLogObject = {
      type: 'http',
      method: req.method,
      url,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      correlationId: getCorrelationId(req),
    };

    this.logger.log(payload);
  }

  private isHealthPath(url: string): boolean {
    const path = url.split('?')[0] ?? url;
    return path === '/health' || path.startsWith('/health/');
  }
}
