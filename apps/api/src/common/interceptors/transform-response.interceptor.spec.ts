import { CallHandler, ExecutionContext, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of, firstValueFrom } from 'rxjs';

import { SKIP_TRANSFORM_KEY } from '../decorators/skip-transform.decorator';
import { TransformResponseInterceptor } from './transform-response.interceptor';

describe('TransformResponseInterceptor', () => {
  const createContext = (
    statusCode = HttpStatus.OK,
    correlationId = 'corr-test-1',
  ): ExecutionContext =>
    ({
      getHandler: () => Function,
      getClass: () => class TestController {},
      switchToHttp: () => ({
        getRequest: () => ({ correlationId }),
        getResponse: () => ({ statusCode }),
      }),
    }) as unknown as ExecutionContext;

  it('wraps successful payloads in { data, meta.correlationId }', async () => {
    const getAllAndOverride = jest.fn().mockReturnValue(false);
    const reflector = { getAllAndOverride } as unknown as Reflector;
    const interceptor = new TransformResponseInterceptor(reflector);
    const handler: CallHandler = { handle: () => of({ ok: true }) };

    const result = await firstValueFrom(
      interceptor.intercept(createContext(), handler),
    );

    expect(getAllAndOverride).toHaveBeenCalledWith(
      SKIP_TRANSFORM_KEY,
      expect.any(Array),
    );
    expect(result).toEqual({
      data: { ok: true },
      meta: { correlationId: 'corr-test-1' },
    });
  });

  it('skips transform when SkipTransform metadata is set', async () => {
    const getAllAndOverride = jest.fn().mockReturnValue(true);
    const reflector = { getAllAndOverride } as unknown as Reflector;
    const interceptor = new TransformResponseInterceptor(reflector);
    const payload = { status: 'ok' };
    const handler: CallHandler = { handle: () => of(payload) };

    const result = await firstValueFrom(
      interceptor.intercept(createContext(), handler),
    );

    expect(result).toBe(payload);
  });

  it('does not wrap undefined / 204 responses', async () => {
    const getAllAndOverride = jest.fn().mockReturnValue(false);
    const reflector = { getAllAndOverride } as unknown as Reflector;
    const interceptor = new TransformResponseInterceptor(reflector);
    const handler: CallHandler = { handle: () => of(undefined) };

    const result = await firstValueFrom(
      interceptor.intercept(createContext(HttpStatus.NO_CONTENT), handler),
    );

    expect(result).toBeUndefined();
  });
});
