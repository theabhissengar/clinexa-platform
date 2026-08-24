import 'reflect-metadata';

import { Permissions } from '../rbac/constants/permissions';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import {
  REQUIRE_ANY_PERMISSIONS_KEY,
  REQUIRE_PERMISSIONS_KEY,
} from '../rbac/constants/rbac.constants';
import { ROLE_PERMISSION_MATRIX } from '../rbac/constants/role-permission-matrix';
import { Roles } from '../rbac/constants/roles';
import { CrmSubscriptionsController } from './crm-subscriptions.controller';

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

describe('CRM Subscriptions permissions (P14c)', () => {
  it('wires CRM controller methods to approved SUB permissions', () => {
    expect(requiredPermissions(CrmSubscriptionsController, 'list')).toEqual([
      Permissions.SUB_VIEW,
    ]);
    expect(requiredPermissions(CrmSubscriptionsController, 'get')).toEqual([
      Permissions.SUB_VIEW,
    ]);
    expect(requiredPermissions(CrmSubscriptionsController, 'notes')).toEqual([
      Permissions.SUB_VIEW,
    ]);
    expect(requiredPermissions(CrmSubscriptionsController, 'history')).toEqual([
      Permissions.SUB_VIEW,
    ]);
    expect(requiredPermissions(CrmSubscriptionsController, 'activity')).toEqual(
      [Permissions.SUB_VIEW],
    );
    expect(requiredPermissions(CrmSubscriptionsController, 'renewals')).toEqual(
      [Permissions.SUB_VIEW],
    );
    expect(requiredPermissions(CrmSubscriptionsController, 'update')).toEqual([
      Permissions.SUB_EDIT,
    ]);
    expect(requiredPermissions(CrmSubscriptionsController, 'addNote')).toEqual([
      Permissions.SUB_EDIT,
    ]);
    expect(requiredPermissions(CrmSubscriptionsController, 'pause')).toEqual([
      Permissions.SUB_LIFECYCLE,
    ]);
    expect(requiredPermissions(CrmSubscriptionsController, 'resume')).toEqual([
      Permissions.SUB_LIFECYCLE,
    ]);
    expect(requiredPermissions(CrmSubscriptionsController, 'cancel')).toEqual([
      Permissions.SUB_LIFECYCLE,
    ]);
    expect(
      requiredPermissions(CrmSubscriptionsController, 'openRenewal'),
    ).toEqual([Permissions.SUB_RENEW]);
  });

  it('allows SUB_RENEW or SUB_ASSIST_RENEWAL on retry (OR semantics)', () => {
    const handler = (
      CrmSubscriptionsController.prototype as Record<string, unknown>
    ).retryRenewal;
    expect(typeof handler).toBe('function');
    const metadata: unknown = Reflect.getMetadata(
      REQUIRE_ANY_PERMISSIONS_KEY,
      handler,
    );
    expect(metadata).toEqual([
      Permissions.SUB_RENEW,
      Permissions.SUB_ASSIST_RENEWAL,
    ]);
  });

  it('does not expose Class D or create handlers on CRM', () => {
    const prototype = CrmSubscriptionsController.prototype as Record<
      string,
      unknown
    >;
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

  it('never grants create or Class D to CRM-operational roles', () => {
    for (const role of CRM_OPERATIONAL_ROLES) {
      const granted = ROLE_PERMISSION_MATRIX[role] ?? [];
      for (const code of CLASS_D_AND_CREATE) {
        expect(granted).not.toContain(code);
      }
    }
  });

  it('RequirePermissions accepts SUB Class D codes for later Guardian use', () => {
    const decorator = RequirePermissions(Permissions.SUB_DELETE);
    expect(typeof decorator).toBe('function');
  });
});
