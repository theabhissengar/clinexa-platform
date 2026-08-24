import {
  PERMISSION_DEFINITIONS,
  Permissions,
} from '../rbac/constants/permissions';
import { ROLE_PERMISSION_MATRIX } from '../rbac/constants/role-permission-matrix';
import { Roles } from '../rbac/constants/roles';

const CLASS_D_AND_CREATE = [
  Permissions.SUB_CREATE,
  Permissions.SUB_CORRECT,
  Permissions.SUB_DELETE,
  Permissions.SUB_ARCHIVE,
  Permissions.SUB_RESTORE,
  Permissions.SUB_OVERRIDE,
] as const;

const CRM_OPERATIONAL_ROLES = [
  Roles.DOCTOR,
  Roles.PHARMACIST,
  Roles.SUPPORT,
  Roles.OPERATIONS,
  Roles.MARKETING,
  Roles.CONTENT,
] as const;

describe('Subscriptions permissions (P14a foundation)', () => {
  it('exposes the approved PERM-SUB dictionary including unused 013 gap', () => {
    expect(Permissions.SUB_MANAGE_OWN).toBe('PERM-SUB-001');
    expect(Permissions.SUB_CONFIGURE_PLANS).toBe('PERM-SUB-002');
    expect(Permissions.SUB_ASSIST_RENEWAL).toBe('PERM-SUB-003');
    expect(Permissions.SUB_VIEW).toBe('PERM-SUB-004');
    expect(Permissions.SUB_CREATE).toBe('PERM-SUB-005');
    expect(Permissions.SUB_EDIT).toBe('PERM-SUB-006');
    expect(Permissions.SUB_LIFECYCLE).toBe('PERM-SUB-007');
    expect(Permissions.SUB_RENEW).toBe('PERM-SUB-008');
    expect(Permissions.SUB_CORRECT).toBe('PERM-SUB-009');
    expect(Permissions.SUB_DELETE).toBe('PERM-SUB-010');
    expect(Permissions.SUB_ARCHIVE).toBe('PERM-SUB-011');
    expect(Permissions.SUB_RESTORE).toBe('PERM-SUB-012');
    expect(Permissions.SUB_OVERRIDE).toBe('PERM-SUB-014');
    expect(Object.values(Permissions)).not.toContain('PERM-SUB-013');
  });

  it('seeds every approved Subscription permission definition', () => {
    const codes = PERMISSION_DEFINITIONS.map((definition) => definition.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        Permissions.SUB_VIEW,
        Permissions.SUB_CREATE,
        Permissions.SUB_EDIT,
        Permissions.SUB_LIFECYCLE,
        Permissions.SUB_RENEW,
        Permissions.SUB_CORRECT,
        Permissions.SUB_DELETE,
        Permissions.SUB_ARCHIVE,
        Permissions.SUB_RESTORE,
        Permissions.SUB_OVERRIDE,
      ]),
    );
  });

  it('never grants create or Class D to CRM-operational roles', () => {
    for (const role of CRM_OPERATIONAL_ROLES) {
      const granted = ROLE_PERMISSION_MATRIX[role] ?? [];
      for (const code of CLASS_D_AND_CREATE) {
        expect(granted).not.toContain(code);
      }
    }
  });

  it('grants staff view to clinical and ops roles; override only to Super Administrator', () => {
    expect(ROLE_PERMISSION_MATRIX[Roles.DOCTOR]).toContain(
      Permissions.SUB_VIEW,
    );
    expect(ROLE_PERMISSION_MATRIX[Roles.PHARMACIST]).toContain(
      Permissions.SUB_VIEW,
    );
    expect(ROLE_PERMISSION_MATRIX[Roles.SUPPORT]).toContain(
      Permissions.SUB_VIEW,
    );
    expect(ROLE_PERMISSION_MATRIX[Roles.OPERATIONS]).toContain(
      Permissions.SUB_VIEW,
    );
    expect(ROLE_PERMISSION_MATRIX[Roles.ADMINISTRATOR]).toContain(
      Permissions.SUB_CREATE,
    );
    expect(ROLE_PERMISSION_MATRIX[Roles.ADMINISTRATOR]).not.toContain(
      Permissions.SUB_OVERRIDE,
    );
    expect(ROLE_PERMISSION_MATRIX[Roles.SUPER_ADMINISTRATOR]).toContain(
      Permissions.SUB_OVERRIDE,
    );
  });

  it('does not imply Class D from plan configure or staff edit', () => {
    expect(Permissions.SUB_CONFIGURE_PLANS).not.toBe(Permissions.SUB_DELETE);
    expect(Permissions.SUB_EDIT).not.toBe(Permissions.SUB_DELETE);
    expect(Permissions.SUB_EDIT).not.toBe(Permissions.SUB_ARCHIVE);
  });
});
