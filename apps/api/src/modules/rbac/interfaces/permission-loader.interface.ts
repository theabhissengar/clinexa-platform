import type { PermissionCode } from '../constants/permissions';
import type { RoleCode } from '../constants/roles';

/**
 * Authorization payload attached to the authenticated principal.
 */
export type PrincipalAuthorization = {
  roles: RoleCode[];
  permissions: PermissionCode[];
};

/**
 * Port for loading role/permission assignments.
 * Postgres today; Redis (or other cache) can replace the provider later
 * without changing guards or controllers.
 */
export interface PermissionLoader {
  loadByUserId(userId: string): Promise<PrincipalAuthorization>;
}
