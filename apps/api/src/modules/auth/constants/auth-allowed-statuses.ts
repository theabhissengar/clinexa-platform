import { UserStatus } from '../../../../generated/prisma';

/** Statuses that may authenticate (Auth enforces; Users owns the enum). */
export const AUTH_ALLOWED_STATUSES: readonly UserStatus[] = [UserStatus.ACTIVE];
