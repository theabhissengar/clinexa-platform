import 'reflect-metadata';

import { Permissions } from '../rbac/constants/permissions';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { REQUIRE_PERMISSIONS_KEY } from '../rbac/constants/rbac.constants';
import { ROLE_PERMISSION_MATRIX } from '../rbac/constants/role-permission-matrix';
import { Roles } from '../rbac/constants/roles';
import { CrmOrdersController } from './crm-orders.controller';

const CLASS_D_ORDER_PERMISSIONS = [
  Permissions.ORD_DELETE,
  Permissions.ORD_ARCHIVE,
  Permissions.ORD_RESTORE,
  Permissions.ORD_CORRECT,
  Permissions.ORD_OVERRIDE,
] as const;

const CRM_OPERATIONAL_ROLES = [
  Roles.DOCTOR,
  Roles.PHARMACIST,
  Roles.SUPPORT,
  Roles.OPERATIONS,
  Roles.MARKETING,
  Roles.CONTENT,
] as const;

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

describe('CRM Orders permissions (P13c)', () => {
  it('defines ORD permission codes including Class D and edit', () => {
    expect(Permissions.ORD_VIEW).toBe('PERM-ORD-001');
    expect(Permissions.ORD_CANCEL).toBe('PERM-ORD-002');
    expect(Permissions.ORD_FULFILL).toBe('PERM-ORD-003');
    expect(Permissions.ORD_CREATE).toBe('PERM-ORD-004');
    expect(Permissions.ORD_EDIT).toBe('PERM-ORD-005');
    expect(Permissions.ORD_DELETE).toBe('PERM-ORD-010');
    expect(Permissions.ORD_ARCHIVE).toBe('PERM-ORD-011');
    expect(Permissions.ORD_RESTORE).toBe('PERM-ORD-012');
    expect(Permissions.ORD_CORRECT).toBe('PERM-ORD-013');
    expect(Permissions.ORD_OVERRIDE).toBe('PERM-ORD-014');
  });

  it('wires CRM controller methods to the correct permissions', () => {
    expect(requiredPermissions(CrmOrdersController, 'list')).toEqual([
      Permissions.ORD_VIEW,
    ]);
    expect(requiredPermissions(CrmOrdersController, 'get')).toEqual([
      Permissions.ORD_VIEW,
    ]);
    expect(requiredPermissions(CrmOrdersController, 'items')).toEqual([
      Permissions.ORD_VIEW,
    ]);
    expect(requiredPermissions(CrmOrdersController, 'notes')).toEqual([
      Permissions.ORD_VIEW,
    ]);
    expect(requiredPermissions(CrmOrdersController, 'history')).toEqual([
      Permissions.ORD_VIEW,
    ]);
    expect(requiredPermissions(CrmOrdersController, 'activity')).toEqual([
      Permissions.ORD_VIEW,
    ]);
    expect(requiredPermissions(CrmOrdersController, 'update')).toEqual([
      Permissions.ORD_EDIT,
    ]);
    expect(requiredPermissions(CrmOrdersController, 'addNote')).toEqual([
      Permissions.ORD_EDIT,
    ]);
    expect(requiredPermissions(CrmOrdersController, 'cancel')).toEqual([
      Permissions.ORD_CANCEL,
    ]);
    expect(requiredPermissions(CrmOrdersController, 'fulfill')).toEqual([
      Permissions.ORD_FULFILL,
    ]);
  });

  it('does not expose Class D or create handlers on CRM controller', () => {
    const prototype = CrmOrdersController.prototype as Record<string, unknown>;
    for (const method of [
      'create',
      'softDelete',
      'archive',
      'restore',
      'correct',
      'override',
      'delete',
    ]) {
      expect(typeof prototype[method]).not.toBe('function');
    }
  });

  it('never grants Class D ORD permissions to CRM-operational roles', () => {
    for (const role of CRM_OPERATIONAL_ROLES) {
      const granted = ROLE_PERMISSION_MATRIX[role] ?? [];
      for (const code of CLASS_D_ORDER_PERMISSIONS) {
        expect(granted).not.toContain(code);
      }
      expect(granted).not.toContain(Permissions.ORD_CREATE);
    }
  });

  it('grants ORD_EDIT to Support and Operations; fulfill only to Ops+', () => {
    expect(ROLE_PERMISSION_MATRIX[Roles.SUPPORT]).toContain(
      Permissions.ORD_EDIT,
    );
    expect(ROLE_PERMISSION_MATRIX[Roles.SUPPORT]).not.toContain(
      Permissions.ORD_FULFILL,
    );
    expect(ROLE_PERMISSION_MATRIX[Roles.OPERATIONS]).toContain(
      Permissions.ORD_FULFILL,
    );
    expect(ROLE_PERMISSION_MATRIX[Roles.OPERATIONS]).toContain(
      Permissions.ORD_EDIT,
    );
  });

  it('RequirePermissions accepts ORD Class D codes', () => {
    const decorator = RequirePermissions(Permissions.ORD_DELETE);
    expect(typeof decorator).toBe('function');
  });
});
