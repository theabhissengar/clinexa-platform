import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { WorkerSecretGuard } from './worker-secret.guard';

function contextWithHeader(value: string | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        header: (name: string) =>
          name.toLowerCase() === 'x-clinexa-worker-secret' ? value : undefined,
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('WorkerSecretGuard (Phase 6G S5)', () => {
  const expected = 'worker-secret-value-16';
  const config = {
    getOrThrow: jest.fn(() => expected),
  } as unknown as ConfigService;
  const guard = new WorkerSecretGuard(config);

  it('accepts an exact match via timing-safe compare', () => {
    expect(guard.canActivate(contextWithHeader(expected))).toBe(true);
  });

  it('rejects a wrong secret without leaking the expected value', () => {
    expect(() =>
      guard.canActivate(contextWithHeader('wrong-secret-value!!')),
    ).toThrow(UnauthorizedException);
  });

  it('rejects length-mismatched secrets', () => {
    expect(() => guard.canActivate(contextWithHeader('short'))).toThrow(
      UnauthorizedException,
    );
  });
});
