import { BadRequestException, Injectable } from '@nestjs/common';
import { UserStatus } from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { AUTH_ALLOWED_STATUSES } from '../auth/constants/auth-allowed-statuses';

/**
 * User lifecycle transitions (docs/32 §11).
 *
 * pending_verification → active ⇄ suspended
 *                      active ⇄ inactive
 *                      active|inactive|suspended → archived ⇄ (restore → active)
 *                      archived → deleted
 */
const ALLOWED: Record<UserStatus, UserStatus[]> = {
  [UserStatus.PENDING_VERIFICATION]: [
    UserStatus.ACTIVE,
    UserStatus.SUSPENDED,
    UserStatus.INACTIVE,
    UserStatus.ARCHIVED,
  ],
  [UserStatus.ACTIVE]: [
    UserStatus.SUSPENDED,
    UserStatus.INACTIVE,
    UserStatus.ARCHIVED,
  ],
  [UserStatus.SUSPENDED]: [
    UserStatus.ACTIVE,
    UserStatus.INACTIVE,
    UserStatus.ARCHIVED,
  ],
  [UserStatus.INACTIVE]: [
    UserStatus.ACTIVE,
    UserStatus.SUSPENDED,
    UserStatus.ARCHIVED,
  ],
  [UserStatus.ARCHIVED]: [UserStatus.ACTIVE, UserStatus.DELETED],
  [UserStatus.DELETED]: [],
};

@Injectable()
export class UserLifecycleService {
  assertTransition(from: UserStatus, to: UserStatus): void {
    if (from === to) {
      return;
    }
    if (!ALLOWED[from].includes(to)) {
      throw new BadRequestException({
        code: ErrorCodes.USR_INVALID_TRANSITION,
        message: `Invalid user lifecycle transition: ${from} → ${to}`,
      });
    }
  }

  isAuthAllowed(status: UserStatus): boolean {
    return AUTH_ALLOWED_STATUSES.includes(status);
  }
}
