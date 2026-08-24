import { SetMetadata } from '@nestjs/common';

import { REQUIRE_ANY_PERMISSIONS_KEY } from '../constants/rbac.constants';
import type { PermissionCode } from '../constants/permissions';

/**
 * Requires the principal to hold ANY of the listed permissions (OR semantics).
 * Use sparingly — prefer RequirePermissions (AND) when a single permission is enough.
 */
export const RequireAnyPermissions = (...permissions: PermissionCode[]) =>
  SetMetadata(REQUIRE_ANY_PERMISSIONS_KEY, permissions);
