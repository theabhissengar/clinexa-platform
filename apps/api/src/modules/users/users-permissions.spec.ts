import 'reflect-metadata';

import { Permissions } from '../rbac/constants/permissions';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { REQUIRE_PERMISSIONS_KEY } from '../rbac/constants/rbac.constants';
import { ROLE_PERMISSION_MATRIX } from '../rbac/constants/role-permission-matrix';
import { Roles } from '../rbac/constants/roles';
import { AdminUsersController } from './admin-users.controller';
import { CrmUsersController } from './crm-users.controller';
import { UserLifecycleService } from './user-lifecycle.service';
import { UsersService } from './users.service';
import { UserStatus } from '../../../generated/prisma';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { PasswordHasher } from '../auth/password.hasher';

const CLASS_D_USER_PERMISSIONS = [
  Permissions.ADM_DELETE_USER,
  Permissions.ADM_ARCHIVE_USER,
  Permissions.ADM_RESTORE_USER,
  Permissions.ADM_BULK_CLEANUP,
  Permissions.ADM_HARD_DELETE,
] as const;

/** CRM-context roles that touch user records without governance authority. */
const CRM_OPERATIONAL_ROLES = [
  Roles.DOCTOR,
  Roles.PHARMACIST,
  Roles.SUPPORT,
  Roles.OPERATIONS,
  Roles.MARKETING,
  Roles.CONTENT,
] as const;

const NON_CLASS_D_LIFECYCLE_METHODS = [
  'suspend',
  'deactivate',
  'reactivate',
  'transition',
];

function requiredPermissions(
  controller: abstract new (...args: never[]) => unknown,
  method: string,
): string[] {
  const handler = (controller.prototype as Record<string, unknown>)[method];
  if (typeof handler !== 'function') {
    return [];
  }
  const metadata: unknown = Reflect.getMetadata(
    REQUIRE_PERMISSIONS_KEY,
    handler,
  );
  return Array.isArray(metadata) ? (metadata as string[]) : [];
}

describe('Users Class D permission codes', () => {
  it('exposes distinct Class D codes not implied by manage', () => {
    expect(Permissions.ADM_DELETE_USER).toBe('PERM-ADM-030');
    expect(Permissions.ADM_ARCHIVE_USER).toBe('PERM-ADM-031');
    expect(Permissions.ADM_RESTORE_USER).toBe('PERM-ADM-032');
    expect(Permissions.ADM_BULK_CLEANUP).toBe('PERM-ADM-033');
    expect(Permissions.ADM_HARD_DELETE).toBe('PERM-ADM-034');
    expect(Permissions.ADM_DELETE_USER).not.toBe(Permissions.ADM_MANAGE_USERS);
    expect(Permissions.ADM_ARCHIVE_USER).not.toBe(Permissions.ADM_MANAGE_USERS);
  });

  it('RequirePermissions decorator factory accepts Class D codes', () => {
    const decorator = RequirePermissions(Permissions.ADM_DELETE_USER);
    expect(typeof decorator).toBe('function');
  });

  it('grants Class D only to the governance roles, never via manage-users', () => {
    for (const [roleCode, granted] of Object.entries(ROLE_PERMISSION_MATRIX)) {
      if (!granted.includes(Permissions.ADM_MANAGE_USERS)) {
        continue;
      }
      const holdsClassD = CLASS_D_USER_PERMISSIONS.some((code) =>
        granted.includes(code),
      );
      const expectsClassD =
        roleCode === Roles.ADMINISTRATOR ||
        roleCode === Roles.SUPER_ADMINISTRATOR;
      expect(holdsClassD).toBe(expectsClassD);
    }
  });
});

describe('Users endpoint permission boundaries', () => {
  it('gates each Class D admin endpoint on its own permission', () => {
    expect(requiredPermissions(AdminUsersController, 'archive')).toEqual([
      Permissions.ADM_ARCHIVE_USER,
    ]);
    expect(requiredPermissions(AdminUsersController, 'restore')).toEqual([
      Permissions.ADM_RESTORE_USER,
    ]);
    expect(requiredPermissions(AdminUsersController, 'softDelete')).toEqual([
      Permissions.ADM_DELETE_USER,
    ]);
  });

  it('gates non–Class D lifecycle on manage-users only', () => {
    for (const method of NON_CLASS_D_LIFECYCLE_METHODS) {
      expect(requiredPermissions(AdminUsersController, method)).toEqual([
        Permissions.ADM_MANAGE_USERS,
      ]);
    }
  });

  it('never exposes Class D or admin codes on CRM user endpoints', () => {
    const crmMethods = Object.getOwnPropertyNames(
      CrmUsersController.prototype,
    ).filter((name) => name !== 'constructor');

    expect(crmMethods).toEqual(
      expect.arrayContaining(['list', 'get', 'update']),
    );

    for (const method of crmMethods) {
      const required = requiredPermissions(CrmUsersController, method);
      for (const classD of CLASS_D_USER_PERMISSIONS) {
        expect(required).not.toContain(classD);
      }
      expect(required).not.toContain(Permissions.ADM_MANAGE_USERS);
      expect(required).not.toContain(Permissions.ADM_ASSIGN_ROLES);
    }
  });

  it('has no delete, archive, or role handler on the CRM controller', () => {
    const crmMethods = Object.getOwnPropertyNames(CrmUsersController.prototype);
    expect(crmMethods).not.toContain('softDelete');
    expect(crmMethods).not.toContain('archive');
    expect(crmMethods).not.toContain('restore');
    expect(crmMethods).not.toContain('replaceRoles');
  });

  it('withholds Class D and manage-users from CRM operational roles', () => {
    for (const roleCode of CRM_OPERATIONAL_ROLES) {
      const granted = ROLE_PERMISSION_MATRIX[roleCode];
      for (const classD of CLASS_D_USER_PERMISSIONS) {
        expect(granted).not.toContain(classD);
      }
      expect(granted).not.toContain(Permissions.ADM_MANAGE_USERS);
    }
  });
});

describe('UsersService Class D routing', () => {
  function serviceWithStatus(status: UserStatus) {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user-1', status }),
      },
    } as unknown as PrismaService;

    return new UsersService(
      prisma,
      new UserLifecycleService(),
      {} as PasswordHasher,
    );
  }

  it('refuses archive through the generic transition helper', async () => {
    const service = serviceWithStatus(UserStatus.ACTIVE);
    await expect(
      service.transition('user-1', UserStatus.ARCHIVED, 'actor-1'),
    ).rejects.toMatchObject({
      response: { code: 'ERR-AUTHZ-001' },
    });
  });

  it('refuses restore-from-archived through the generic transition helper', async () => {
    const service = serviceWithStatus(UserStatus.ARCHIVED);
    await expect(
      service.transition('user-1', UserStatus.ACTIVE, 'actor-1'),
    ).rejects.toMatchObject({
      response: { code: 'ERR-AUTHZ-001' },
    });
  });
});
