import 'reflect-metadata';

import { Permissions } from '../rbac/constants/permissions';
import { REQUIRE_PERMISSIONS_KEY } from '../rbac/constants/rbac.constants';
import { ROLE_PERMISSION_MATRIX } from '../rbac/constants/role-permission-matrix';
import { Roles } from '../rbac/constants/roles';
import { AdminOrdersController } from './admin-orders.controller';
import { CrmOrdersController } from './crm-orders.controller';

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

const CLASS_D = [
  Permissions.ORD_DELETE,
  Permissions.ORD_ARCHIVE,
  Permissions.ORD_RESTORE,
  Permissions.ORD_CORRECT,
  Permissions.ORD_OVERRIDE,
] as const;

describe('Guardian Admin Orders permissions (P13d)', () => {
  it('wires admin endpoints to approved permissions', () => {
    expect(requiredPermissions(AdminOrdersController, 'list')).toEqual([
      Permissions.ORD_VIEW,
    ]);
    expect(requiredPermissions(AdminOrdersController, 'get')).toEqual([
      Permissions.ORD_VIEW,
    ]);
    expect(requiredPermissions(AdminOrdersController, 'create')).toEqual([
      Permissions.ORD_CREATE,
    ]);
    expect(requiredPermissions(AdminOrdersController, 'update')).toEqual([
      Permissions.ORD_EDIT,
    ]);
    expect(requiredPermissions(AdminOrdersController, 'softDelete')).toEqual([
      Permissions.ORD_DELETE,
    ]);
    expect(requiredPermissions(AdminOrdersController, 'archive')).toEqual([
      Permissions.ORD_ARCHIVE,
    ]);
    expect(requiredPermissions(AdminOrdersController, 'restore')).toEqual([
      Permissions.ORD_RESTORE,
    ]);
    expect(requiredPermissions(AdminOrdersController, 'correct')).toEqual([
      Permissions.ORD_CORRECT,
    ]);
    expect(requiredPermissions(AdminOrdersController, 'override')).toEqual([
      Permissions.ORD_OVERRIDE,
    ]);
  });

  it('CRM controller never exposes create or Class D methods', () => {
    const crm = CrmOrdersController.prototype as Record<string, unknown>;
    for (const method of [
      'create',
      'softDelete',
      'archive',
      'restore',
      'correct',
      'override',
    ]) {
      expect(typeof crm[method]).not.toBe('function');
    }
  });

  it('never grants Class D or create to CRM-operational roles', () => {
    for (const role of [
      Roles.DOCTOR,
      Roles.PHARMACIST,
      Roles.SUPPORT,
      Roles.OPERATIONS,
      Roles.MARKETING,
      Roles.CONTENT,
    ]) {
      const granted = ROLE_PERMISSION_MATRIX[role] ?? [];
      expect(granted).not.toContain(Permissions.ORD_CREATE);
      for (const code of CLASS_D) {
        expect(granted).not.toContain(code);
      }
    }
  });

  it('grants override only to Super Administrator', () => {
    expect(ROLE_PERMISSION_MATRIX[Roles.SUPER_ADMINISTRATOR]).toContain(
      Permissions.ORD_OVERRIDE,
    );
    expect(ROLE_PERMISSION_MATRIX[Roles.ADMINISTRATOR]).not.toContain(
      Permissions.ORD_OVERRIDE,
    );
  });
});
