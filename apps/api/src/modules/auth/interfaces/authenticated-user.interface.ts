import type { PermissionCode } from '../../rbac/constants/permissions';
import type { RoleCode } from '../../rbac/constants/roles';

/**
 * Principal attached to the request after successful AuthN + AuthZ load.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  sessionId: string;
  tokenVersion: number;
  roles: RoleCode[];
  permissions: PermissionCode[];
}
