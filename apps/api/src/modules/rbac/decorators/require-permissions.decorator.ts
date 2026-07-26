import { SetMetadata } from '@nestjs/common';

import { REQUIRE_PERMISSIONS_KEY } from '../constants/rbac.constants';
import type { PermissionCode } from '../constants/permissions';

/**
 * Requires the principal to hold ALL listed permissions (AND semantics).
 * Prefer this over @RequireRoles for endpoint protection.
 */
export const RequirePermissions = (...permissions: PermissionCode[]) =>
  SetMetadata(REQUIRE_PERMISSIONS_KEY, permissions);
