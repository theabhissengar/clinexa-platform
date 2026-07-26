import { SetMetadata } from '@nestjs/common';

import { REQUIRE_ROLES_KEY } from '../constants/rbac.constants';
import type { RoleCode } from '../constants/roles';

/**
 * Coarse-grained role check (OR semantics across listed roles).
 * Prefer @RequirePermissions for endpoint protection whenever possible.
 */
export const RequireRoles = (...roles: RoleCode[]) =>
  SetMetadata(REQUIRE_ROLES_KEY, roles);
