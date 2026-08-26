import 'reflect-metadata';

import {
  PERMISSION_DEFINITIONS,
  Permissions,
} from '../rbac/constants/permissions';
import { REQUIRE_PERMISSIONS_KEY } from '../rbac/constants/rbac.constants';
import { ROLE_PERMISSION_MATRIX } from '../rbac/constants/role-permission-matrix';
import { Roles } from '../rbac/constants/roles';
import { AdminCouponsController } from './admin-coupons.controller';
import { CouponsController } from './coupons.controller';

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

describe('Admin coupon permissions', () => {
  it('wires API-143–147 and Class D delete to existing CPN codes', () => {
    expect(requiredPermissions(AdminCouponsController, 'list')).toEqual([
      Permissions.CPN_CONFIGURE,
    ]);
    expect(requiredPermissions(AdminCouponsController, 'create')).toEqual([
      Permissions.CPN_CONFIGURE,
    ]);
    expect(requiredPermissions(AdminCouponsController, 'update')).toEqual([
      Permissions.CPN_CONFIGURE,
    ]);
    expect(requiredPermissions(AdminCouponsController, 'deactivate')).toEqual([
      Permissions.CPN_CONFIGURE,
    ]);
    expect(requiredPermissions(AdminCouponsController, 'redemptions')).toEqual([
      Permissions.CPN_CONFIGURE,
    ]);
    expect(requiredPermissions(AdminCouponsController, 'remove')).toEqual([
      Permissions.CPN_DELETE,
    ]);
    expect(requiredPermissions(CouponsController, 'validate')).toEqual([
      Permissions.CPN_REDEEM,
    ]);
  });

  it('seeds PERM-CPN-010 for Administrator and Super Administrator', () => {
    expect(
      PERMISSION_DEFINITIONS.some((d) => d.code === Permissions.CPN_DELETE),
    ).toBe(true);
    expect(ROLE_PERMISSION_MATRIX[Roles.ADMINISTRATOR]).toContain(
      Permissions.CPN_DELETE,
    );
    expect(ROLE_PERMISSION_MATRIX[Roles.SUPER_ADMINISTRATOR]).toContain(
      Permissions.CPN_DELETE,
    );
  });
});
