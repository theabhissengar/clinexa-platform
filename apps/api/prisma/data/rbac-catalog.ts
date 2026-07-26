/**
 * Canonical RBAC seed catalog (docs/08).
 * RolePermission matrix is reconciled on every seed — not additive.
 */
import {
  PERMISSION_DEFINITIONS,
  type PermissionCode,
} from '../../src/modules/rbac/constants/permissions';
import { ROLE_PERMISSION_MATRIX } from '../../src/modules/rbac/constants/role-permission-matrix';
import {
  RoleNames,
  RoleSlugs,
  Roles,
  type RoleCode,
} from '../../src/modules/rbac/constants/roles';

export const SEEDED_ROLE_CODES = Object.values(Roles) as RoleCode[];

export type RoleSeedRow = {
  code: RoleCode;
  slug: string;
  name: string;
  description: string;
};

export const ROLE_SEED_ROWS: RoleSeedRow[] = SEEDED_ROLE_CODES.map((code) => ({
  code,
  slug: RoleSlugs[code],
  name: RoleNames[code],
  description: `${RoleNames[code]} product role (${code})`,
}));

export { PERMISSION_DEFINITIONS, ROLE_PERMISSION_MATRIX };

export function expectedPermissionsForRole(
  role: RoleCode,
): readonly PermissionCode[] {
  return ROLE_PERMISSION_MATRIX[role];
}
