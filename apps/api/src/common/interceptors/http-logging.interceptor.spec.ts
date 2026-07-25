import { CallHandler, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { of, firstValueFrom } from 'rxjs';
import { EventEmitter } from 'node:events';

import { HttpLoggingInterceptor } from './http-logging.interceptor';

describe('HttpLoggingInterceptor', () => {
  it('emits the standard HTTP log object on response finish', async () => {
    const log = jest.fn();
    const configService = {
      get: jest.fn().mockReturnValue(false),
    } as unknown as ConfigService;

    const interceptor = new HttpLoggingInterceptor(configService);
    (interceptor as unknown as { logger: { log: typeof log } }).logger = {
      log,
    };

    const res = new EventEmitter() as EventEmitter & { statusCode: number };
    res.statusCode = 200;

    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
          originalUrl: '/v1/observability-probe',
          url: '/v1/observability-probe',
          correlationId: 'corr-http-1',
        }),
        getResponse: () => res,
      }),
    } as unknown as ExecutionContext;

    const handler: CallHandler = { handle: () => of({ ok: true }) };
    await firstValueFrom(interceptor.intercept(context, handler));
    res.emit('finish');

    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'http',
        method: 'GET',
        url: '/v1/observability-probe',
        statusCode: 200,
        correlationId: 'corr-http-1',
        durationMs: expect.any(Number) as number,
      }),
    );
  });

  it('skips health paths when LOG_HEALTH_REQUESTS is false', async () => {
    const log = jest.fn();
    const configService = {
      get: jest.fn().mockReturnValue(false),
    } as unknown as ConfigService;

    const interceptor = new HttpLoggingInterceptor(configService);
    (interceptor as unknown as { logger: { log: typeof log } }).logger = {
      log,
    };

    const res = new EventEmitter() as EventEmitter & { statusCode: number };
    res.statusCode = 200;

    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
          originalUrl: '/health',
          url: '/health',
          correlationId: 'corr-http-2',
        }),
        getResponse: () => res,
      }),
    } as unknown as ExecutionContext;

    const handler: CallHandler = { handle: () => of({ status: 'ok' }) };
    await firstValueFrom(interceptor.intercept(context, handler));
    res.emit('finish');

    expect(log).not.toHaveBeenCalled();
  });
});
