import { Inject, Injectable } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { PERMISSION_LOADER } from './constants/rbac.constants';
import type { PermissionCode } from './constants/permissions';
import type { RoleCode } from './constants/roles';
import type {
  PermissionLoader,
  PrincipalAuthorization,
} from './interfaces/permission-loader.interface';

/**
 * Owns authorization loading, aggregation, evaluation, and invalidation hooks.
 * Does not own AuthN, clinical gates, object-scope, or user CRUD.
 */
@Injectable()
export class AuthorizationService {
  constructor(
    @Inject(PERMISSION_LOADER)
    private readonly permissionLoader: PermissionLoader,
    private readonly prisma: PrismaService,
  ) {}

  loadPrincipalAuthorization(userId: string): Promise<PrincipalAuthorization> {
    return this.permissionLoader.loadByUserId(userId);
  }

  hasAllPermissions(
    principal: PrincipalAuthorization,
    required: readonly PermissionCode[],
  ): boolean {
    if (required.length === 0) {
      return true;
    }
    const held = new Set(principal.permissions);
    return required.every((code) => held.has(code));
  }

  hasAnyPermissions(
    principal: PrincipalAuthorization,
    required: readonly PermissionCode[],
  ): boolean {
    if (required.length === 0) {
      return true;
    }
    const held = new Set(principal.permissions);
    return required.some((code) => held.has(code));
  }

  hasAnyRole(
    principal: PrincipalAuthorization,
    required: readonly RoleCode[],
  ): boolean {
    if (required.length === 0) {
      return true;
    }
    const held = new Set(principal.roles);
    return required.some((code) => held.has(code));
  }

  /**
   * Bumps tokenVersion so subsequent AuthN rejects stale access tokens.
   * Extension point for future session revoke on role change.
   */
  async invalidateUserAuthorization(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
  }
}
