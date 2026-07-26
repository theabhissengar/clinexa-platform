import { PostgresPermissionLoader } from './permission-loader';
import { Permissions } from './constants/permissions';
import { Roles } from './constants/roles';

describe('PostgresPermissionLoader', () => {
  let loader: PostgresPermissionLoader;
  let prisma: {
    userRoleAssignment: { findMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      userRoleAssignment: { findMany: jest.fn() },
    };
    loader = new PostgresPermissionLoader(prisma as never);
  });

  it('unions permissions across multiple active roles and dedupes', async () => {
    prisma.userRoleAssignment.findMany.mockResolvedValue([
      {
        role: {
          code: Roles.DOCTOR,
          rolePermissions: [
            { permission: { code: Permissions.CRM_ACCESS_SHELL } },
            { permission: { code: Permissions.CRM_APPROVE_RX } },
          ],
        },
      },
      {
        role: {
          code: Roles.SUPPORT,
          rolePermissions: [
            { permission: { code: Permissions.CRM_ACCESS_SHELL } },
            { permission: { code: Permissions.SUP_TRIAGE } },
          ],
        },
      },
    ]);

    const result = await loader.loadByUserId('user-1');

    expect(prisma.userRoleAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', revokedAt: null },
      }),
    );
    expect(result.roles).toEqual(
      expect.arrayContaining([Roles.DOCTOR, Roles.SUPPORT]),
    );
    expect(result.roles).toHaveLength(2);
    expect(result.permissions).toEqual(
      expect.arrayContaining([
        Permissions.CRM_ACCESS_SHELL,
        Permissions.CRM_APPROVE_RX,
        Permissions.SUP_TRIAGE,
      ]),
    );
    expect(
      result.permissions.filter((p) => p === Permissions.CRM_ACCESS_SHELL),
    ).toHaveLength(1);
  });

  it('excludes revoked assignments (query filters revokedAt null)', async () => {
    prisma.userRoleAssignment.findMany.mockResolvedValue([
      {
        role: {
          code: Roles.SUPPORT,
          rolePermissions: [
            { permission: { code: Permissions.SUP_TRIAGE } },
          ],
        },
      },
    ]);

    const result = await loader.loadByUserId('user-1');

    expect(result.roles).toEqual([Roles.SUPPORT]);
    expect(result.permissions).not.toContain(Permissions.CRM_APPROVE_RX);
    expect(result.permissions).toContain(Permissions.SUP_TRIAGE);
  });
});
