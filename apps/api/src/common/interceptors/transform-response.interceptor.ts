import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Observable, map } from 'rxjs';

import { SKIP_TRANSFORM_KEY } from '../decorators/skip-transform.decorator';
import type { ApiSuccessResponse } from '../interfaces/api-success-response.interface';
import { getCorrelationId } from '../utils/correlation-id.util';

@Injectable()
export class TransformResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiSuccessResponse<T> | T | undefined
> {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiSuccessResponse<T> | T | undefined> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_TRANSFORM_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skip) {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<{ statusCode?: number }>();
    const correlationId = getCorrelationId(request);

    return next.handle().pipe(
      map((data) => {
        if (
          response.statusCode === HttpStatus.NO_CONTENT ||
          data === undefined
        ) {
          return data;
        }

        return {
          data,
          meta: { correlationId },
        };
      }),
    );
  }
}
