import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ErrorCodes } from '../../common/constants/error-codes';
import { WorkerSecretGuard } from '../payments/worker-secret.guard';

describe('WorkerSecretGuard (AUTH-015)', () => {
  const config = {
    getOrThrow: jest.fn(() => 'expected-worker-secret'),
  };
  const guard = new WorkerSecretGuard(config as unknown as ConfigService);

  function ctx(header?: string): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          header: (name: string) =>
            name.toLowerCase() === 'x-clinexa-worker-secret' ? header : undefined,
        }),
      }),
    } as unknown as ExecutionContext;
  }

  it('allows matching worker secret', () => {
    expect(guard.canActivate(ctx('expected-worker-secret'))).toBe(true);
  });

  it('rejects missing or wrong secret with ERR-AUTH-001', () => {
    try {
      guard.canActivate(ctx('wrong'));
      fail('expected UnauthorizedException');
    } catch (error) {
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as UnauthorizedException).getResponse()).toEqual(
        expect.objectContaining({ code: ErrorCodes.AUTH_UNAUTHENTICATED }),
      );
    }
    expect(() => guard.canActivate(ctx(undefined))).toThrow(
      UnauthorizedException,
    );
  });
});
