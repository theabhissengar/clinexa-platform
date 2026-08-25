import 'reflect-metadata';

import { Permissions } from '../rbac/constants/permissions';
import { REQUIRE_PERMISSIONS_KEY } from '../rbac/constants/rbac.constants';
import { ROLE_PERMISSION_MATRIX } from '../rbac/constants/role-permission-matrix';
import { Roles } from '../rbac/constants/roles';
import { CrmConsultationsController } from './crm-consultations.controller';

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

describe('CRM Consultations permissions (P14g)', () => {
  it('approve requires PERM-CRM-002', () => {
    expect(requiredPermissions(CrmConsultationsController, 'approve')).toEqual([
      Permissions.CRM_APPROVE_RX,
    ]);
  });

  it('decline requires PERM-CRM-003', () => {
    expect(requiredPermissions(CrmConsultationsController, 'decline')).toEqual([
      Permissions.CRM_DECLINE_RX,
    ]);
  });

  it('grants approve/decline to Doctor only among operational roles', () => {
    const doctor = new Set(ROLE_PERMISSION_MATRIX[Roles.DOCTOR] ?? []);
    expect(doctor.has(Permissions.CRM_APPROVE_RX)).toBe(true);
    expect(doctor.has(Permissions.CRM_DECLINE_RX)).toBe(true);

    for (const role of [
      Roles.PHARMACIST,
      Roles.SUPPORT,
      Roles.OPERATIONS,
      Roles.MARKETING,
      Roles.CONTENT,
    ] as const) {
      const perms = new Set(ROLE_PERMISSION_MATRIX[role] ?? []);
      expect(perms.has(Permissions.CRM_APPROVE_RX)).toBe(false);
      expect(perms.has(Permissions.CRM_DECLINE_RX)).toBe(false);
    }
  });
});
