import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import { ErrorCodes } from '../../common/constants/error-codes';

/** AUTH-015 — Internal worker shared-secret identity (not a user JWT). */
@Injectable()
export class WorkerSecretGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.header('x-clinexa-worker-secret');
    const expected = this.config.getOrThrow<string>(
      'payments.workerSharedSecret',
    );
    if (!header || header !== expected) {
      throw new UnauthorizedException({
        code: ErrorCodes.AUTH_UNAUTHENTICATED,
        message: 'Invalid worker shared secret',
      });
    }
    return true;
  }
}
