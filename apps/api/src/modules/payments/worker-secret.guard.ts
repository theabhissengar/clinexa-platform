import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import type { Request } from 'express';

import { ErrorCodes } from '../../common/constants/error-codes';

function secretsEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

/** AUTH-015 — Internal worker shared-secret identity (not a user JWT). */
@Injectable()
export class WorkerSecretGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.header('x-clinexa-worker-secret') ?? '';
    const expected = this.config.getOrThrow<string>(
      'payments.workerSharedSecret',
    );
    if (!header || !secretsEqual(header, expected)) {
      throw new UnauthorizedException({
        code: ErrorCodes.AUTH_UNAUTHENTICATED,
        message: 'Invalid worker shared secret',
      });
    }
    return true;
  }
}
