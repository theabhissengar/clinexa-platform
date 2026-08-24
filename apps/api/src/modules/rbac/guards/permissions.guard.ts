import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { ErrorCodes } from '../../../common/constants/error-codes';
import { IS_PUBLIC_KEY } from '../../auth/constants/auth.constants';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AuthorizationService } from '../authorization.service';
import {
  REQUIRE_ANY_PERMISSIONS_KEY,
  REQUIRE_PERMISSIONS_KEY,
  REQUIRE_ROLES_KEY,
} from '../constants/rbac.constants';
import type { PermissionCode } from '../constants/permissions';
import type { RoleCode } from '../constants/roles';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorizationService: AuthorizationService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const requiredPermissions =
      this.reflector.getAllAndOverride<PermissionCode[]>(
        REQUIRE_PERMISSIONS_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? [];

    const requiredAnyPermissions =
      this.reflector.getAllAndOverride<PermissionCode[]>(
        REQUIRE_ANY_PERMISSIONS_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? [];

    const requiredRoles =
      this.reflector.getAllAndOverride<RoleCode[]>(REQUIRE_ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (
      requiredPermissions.length === 0 &&
      requiredAnyPermissions.length === 0 &&
      requiredRoles.length === 0
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new ForbiddenException({
        code: ErrorCodes.AUTHZ_MISSING_PERMISSION,
        message: 'Permission denied',
      });
    }

    const principal = {
      roles: user.roles,
      permissions: user.permissions,
    };

    if (
      requiredPermissions.length > 0 &&
      !this.authorizationService.hasAllPermissions(
        principal,
        requiredPermissions,
      )
    ) {
      throw new ForbiddenException({
        code: ErrorCodes.AUTHZ_MISSING_PERMISSION,
        message: 'Permission denied',
      });
    }

    if (
      requiredAnyPermissions.length > 0 &&
      !this.authorizationService.hasAnyPermissions(
        principal,
        requiredAnyPermissions,
      )
    ) {
      throw new ForbiddenException({
        code: ErrorCodes.AUTHZ_MISSING_PERMISSION,
        message: 'Permission denied',
      });
    }

    if (
      requiredRoles.length > 0 &&
      !this.authorizationService.hasAnyRole(principal, requiredRoles)
    ) {
      throw new ForbiddenException({
        code: ErrorCodes.AUTHZ_MISSING_PERMISSION,
        message: 'Permission denied',
      });
    }

    return true;
  }
}
