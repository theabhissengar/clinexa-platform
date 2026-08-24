import 'reflect-metadata';

import { Permissions } from '../rbac/constants/permissions';
import {
  REQUIRE_ANY_PERMISSIONS_KEY,
  REQUIRE_PERMISSIONS_KEY,
} from '../rbac/constants/rbac.constants';
import { ROLE_PERMISSION_MATRIX } from '../rbac/constants/role-permission-matrix';
import { Roles } from '../rbac/constants/roles';
import { AdminSubscriptionsController } from './admin-subscriptions.controller';
import { AdminSubscriptionPlansController } from './admin-subscription-plans.controller';
import { CrmSubscriptionsController } from './crm-subscriptions.controller';

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

const CLASS_D_AND_CREATE = [
  Permissions.SUB_CREATE,
  Permissions.SUB_CORRECT,
  Permissions.SUB_DELETE,
  Permissions.SUB_ARCHIVE,
  Permissions.SUB_RESTORE,
  Permissions.SUB_OVERRIDE,
] as const;

describe('Guardian Admin Subscriptions permissions (P14d)', () => {
  it('wires admin endpoints to approved permissions', () => {
    expect(requiredPermissions(AdminSubscriptionsController, 'list')).toEqual([
      Permissions.SUB_VIEW,
    ]);
    expect(requiredPermissions(AdminSubscriptionsController, 'get')).toEqual([
      Permissions.SUB_VIEW,
    ]);
    expect(requiredPermissions(AdminSubscriptionsController, 'create')).toEqual(
      [Permissions.SUB_CREATE],
    );
    expect(requiredPermissions(AdminSubscriptionsController, 'update')).toEqual(
      [Permissions.SUB_EDIT],
    );
    expect(requiredPermissions(AdminSubscriptionsController, 'pause')).toEqual([
      Permissions.SUB_LIFECYCLE,
    ]);
    expect(requiredPermissions(AdminSubscriptionsController, 'resume')).toEqual(
      [Permissions.SUB_LIFECYCLE],
    );
    expect(requiredPermissions(AdminSubscriptionsController, 'cancel')).toEqual(
      [Permissions.SUB_LIFECYCLE],
    );
    expect(
      requiredPermissions(AdminSubscriptionsController, 'activate'),
    ).toEqual([Permissions.SUB_LIFECYCLE]);
    expect(
      requiredPermissions(AdminSubscriptionsController, 'softDelete'),
    ).toEqual([Permissions.SUB_DELETE]);
    expect(
      requiredPermissions(AdminSubscriptionsController, 'archive'),
    ).toEqual([Permissions.SUB_ARCHIVE]);
    expect(
      requiredPermissions(AdminSubscriptionsController, 'restore'),
    ).toEqual([Permissions.SUB_RESTORE]);
    expect(
      requiredPermissions(AdminSubscriptionsController, 'correct'),
    ).toEqual([Permissions.SUB_CORRECT]);
    expect(
      requiredPermissions(AdminSubscriptionsController, 'override'),
    ).toEqual([Permissions.SUB_OVERRIDE]);
    expect(
      requiredPermissions(AdminSubscriptionsController, 'openRenewal'),
    ).toEqual([Permissions.SUB_RENEW]);
  });

  it('allows SUB_RENEW or SUB_ASSIST_RENEWAL on admin retry (OR semantics)', () => {
    const handler = (
      AdminSubscriptionsController.prototype as Record<string, unknown>
    ).retryRenewal;
    const metadata: unknown = Reflect.getMetadata(
      REQUIRE_ANY_PERMISSIONS_KEY,
      handler,
    );
    expect(metadata).toEqual([
      Permissions.SUB_RENEW,
      Permissions.SUB_ASSIST_RENEWAL,
    ]);
  });

  it('wires plan endpoints to PERM-SUB-002 only (not subscription Class D)', () => {
    for (const method of [
      'list',
      'create',
      'get',
      'update',
      'publish',
      'unpublish',
      'archive',
      'restore',
    ]) {
      expect(
        requiredPermissions(AdminSubscriptionPlansController, method),
      ).toEqual([Permissions.SUB_CONFIGURE_PLANS]);
    }
  });

  it('CRM controller never exposes create or Class D methods', () => {
    const crm = CrmSubscriptionsController.prototype as Record<string, unknown>;
    for (const method of [
      'create',
      'softDelete',
      'archive',
      'restore',
      'correct',
      'override',
      'activate',
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
      expect(granted).not.toContain(Permissions.SUB_CREATE);
      for (const code of CLASS_D_AND_CREATE) {
        expect(granted).not.toContain(code);
      }
    }
  });

  it('grants Guardian Admin intended capabilities without override', () => {
    const granted = ROLE_PERMISSION_MATRIX[Roles.ADMINISTRATOR] ?? [];
    expect(granted).toContain(Permissions.SUB_CONFIGURE_PLANS);
    expect(granted).toContain(Permissions.SUB_VIEW);
    expect(granted).toContain(Permissions.SUB_CREATE);
    expect(granted).toContain(Permissions.SUB_EDIT);
    expect(granted).toContain(Permissions.SUB_LIFECYCLE);
    expect(granted).toContain(Permissions.SUB_RENEW);
    expect(granted).toContain(Permissions.SUB_CORRECT);
    expect(granted).toContain(Permissions.SUB_DELETE);
    expect(granted).toContain(Permissions.SUB_ARCHIVE);
    expect(granted).toContain(Permissions.SUB_RESTORE);
    expect(granted).not.toContain(Permissions.SUB_OVERRIDE);
  });

  it('grants override only to Super Administrator', () => {
    expect(ROLE_PERMISSION_MATRIX[Roles.SUPER_ADMINISTRATOR]).toContain(
      Permissions.SUB_OVERRIDE,
    );
    expect(ROLE_PERMISSION_MATRIX[Roles.ADMINISTRATOR]).not.toContain(
      Permissions.SUB_OVERRIDE,
    );
  });

  it('keeps Marketing/Content off subscription operations', () => {
    for (const role of [Roles.MARKETING, Roles.CONTENT]) {
      const granted = ROLE_PERMISSION_MATRIX[role] ?? [];
      expect(granted).not.toContain(Permissions.SUB_VIEW);
      expect(granted).not.toContain(Permissions.SUB_EDIT);
      expect(granted).not.toContain(Permissions.SUB_CONFIGURE_PLANS);
    }
  });

  it('keeps Doctor/Pharmacist to view-only subscriptions', () => {
    for (const role of [Roles.DOCTOR, Roles.PHARMACIST]) {
      const granted = ROLE_PERMISSION_MATRIX[role] ?? [];
      expect(granted).toContain(Permissions.SUB_VIEW);
      expect(granted).not.toContain(Permissions.SUB_EDIT);
      expect(granted).not.toContain(Permissions.SUB_LIFECYCLE);
      expect(granted).not.toContain(Permissions.SUB_CREATE);
    }
  });
});
