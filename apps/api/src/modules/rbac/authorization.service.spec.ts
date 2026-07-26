import { AuthorizationService } from './authorization.service';
import { Permissions } from './constants/permissions';
import { Roles } from './constants/roles';

describe('AuthorizationService', () => {
  let service: AuthorizationService;
  let loader: { loadByUserId: jest.Mock };
  let prisma: { user: { update: jest.Mock } };

  beforeEach(() => {
    loader = {
      loadByUserId: jest.fn(),
    };
    prisma = {
      user: {
        update: jest.fn().mockResolvedValue({}),
      },
    };
    service = new AuthorizationService(loader, prisma as never);
  });

  it('loads authorization via PermissionLoader', async () => {
    loader.loadByUserId.mockResolvedValue({
      roles: [Roles.DOCTOR, Roles.SUPPORT],
      permissions: [
        Permissions.CRM_ACCESS_SHELL,
        Permissions.CRM_APPROVE_RX,
        Permissions.SUP_TRIAGE,
      ],
    });

    const result = await service.loadPrincipalAuthorization('user-1');

    expect(loader.loadByUserId).toHaveBeenCalledWith('user-1');
    expect(result.roles).toEqual([Roles.DOCTOR, Roles.SUPPORT]);
    expect(result.permissions).toContain(Permissions.CRM_APPROVE_RX);
    expect(result.permissions).toContain(Permissions.SUP_TRIAGE);
  });

  it('evaluates RequirePermissions with AND semantics', () => {
    const principal = {
      roles: [Roles.ADMINISTRATOR],
      permissions: [Permissions.CRM_ACCESS_SHELL, Permissions.ADM_MANAGE_USERS],
    };

    expect(
      service.hasAllPermissions(principal, [
        Permissions.CRM_ACCESS_SHELL,
        Permissions.ADM_MANAGE_USERS,
      ]),
    ).toBe(true);

    expect(
      service.hasAllPermissions(principal, [
        Permissions.CRM_ACCESS_SHELL,
        Permissions.CRM_APPROVE_RX,
      ]),
    ).toBe(false);
  });

  it('treats overlapping permissions as a set (caller supplies deduped list)', () => {
    const principal = {
      roles: [Roles.DOCTOR, Roles.SUPPORT],
      permissions: [Permissions.CRM_ACCESS_SHELL],
    };

    expect(
      service.hasAllPermissions(principal, [Permissions.CRM_ACCESS_SHELL]),
    ).toBe(true);
  });

  it('evaluates RequireRoles with OR semantics', () => {
    const principal = {
      roles: [Roles.SUPPORT],
      permissions: [Permissions.CRM_ACCESS_SHELL],
    };

    expect(service.hasAnyRole(principal, [Roles.DOCTOR, Roles.SUPPORT])).toBe(
      true,
    );
    expect(service.hasAnyRole(principal, [Roles.DOCTOR])).toBe(false);
  });

  it('Administrator lacks clinical approve by default matrix expectation', () => {
    const principal = {
      roles: [Roles.ADMINISTRATOR],
      permissions: [Permissions.CRM_ACCESS_SHELL, Permissions.ADM_MANAGE_USERS],
    };

    expect(
      service.hasAllPermissions(principal, [Permissions.CRM_APPROVE_RX]),
    ).toBe(false);
  });

  it('bumps tokenVersion on invalidateUserAuthorization', async () => {
    await service.invalidateUserAuthorization('user-1');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { tokenVersion: { increment: 1 } },
    });
  });
});
