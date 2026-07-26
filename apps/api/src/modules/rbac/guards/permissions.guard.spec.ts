import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ErrorCodes } from '../../../common/constants/error-codes';
import { IS_PUBLIC_KEY } from '../../auth/constants/auth.constants';
import { AuthorizationService } from '../authorization.service';
import { Permissions } from '../constants/permissions';
import {
  REQUIRE_PERMISSIONS_KEY,
  REQUIRE_ROLES_KEY,
} from '../constants/rbac.constants';
import { Roles } from '../constants/roles';
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let reflector: { getAllAndOverride: jest.Mock };
  let authorizationService: {
    hasAllPermissions: jest.Mock;
    hasAnyRole: jest.Mock;
  };

  const createContext = (user?: unknown): ExecutionContext =>
    ({
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    };
    authorizationService = {
      hasAllPermissions: jest.fn(),
      hasAnyRole: jest.fn(),
    };
    guard = new PermissionsGuard(
      reflector as unknown as Reflector,
      authorizationService as unknown as AuthorizationService,
    );
  });

  it('allows @Public routes without AuthZ checks', () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === IS_PUBLIC_KEY) return true;
      return undefined;
    });

    expect(guard.canActivate(createContext())).toBe(true);
    expect(authorizationService.hasAllPermissions).not.toHaveBeenCalled();
  });

  it('allows authenticated endpoints without permission decorators', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    expect(
      guard.canActivate(
        createContext({
          id: 'u1',
          roles: [],
          permissions: [],
        }),
      ),
    ).toBe(true);
  });

  it('denies missing permissions with ERR-AUTHZ-001', () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === REQUIRE_PERMISSIONS_KEY) {
        return [Permissions.CRM_APPROVE_RX];
      }
      return undefined;
    });
    authorizationService.hasAllPermissions.mockReturnValue(false);

    expect(() =>
      guard.canActivate(
        createContext({
          id: 'u1',
          roles: [Roles.ADMINISTRATOR],
          permissions: [Permissions.CRM_ACCESS_SHELL],
        }),
      ),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: ErrorCodes.AUTHZ_MISSING_PERMISSION,
        }),
      }),
    );
    expect(() =>
      guard.canActivate(
        createContext({
          id: 'u1',
          roles: [Roles.ADMINISTRATOR],
          permissions: [Permissions.CRM_ACCESS_SHELL],
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows when all required permissions are present', () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === REQUIRE_PERMISSIONS_KEY) {
        return [Permissions.CRM_ACCESS_SHELL];
      }
      if (key === REQUIRE_ROLES_KEY) {
        return [];
      }
      return undefined;
    });
    authorizationService.hasAllPermissions.mockReturnValue(true);

    expect(
      guard.canActivate(
        createContext({
          id: 'u1',
          roles: [Roles.ADMINISTRATOR],
          permissions: [Permissions.CRM_ACCESS_SHELL],
        }),
      ),
    ).toBe(true);
  });
});
