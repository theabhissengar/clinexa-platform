import { Get, Controller } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { Permissions } from './constants/permissions';
import { RequirePermissions } from './decorators/require-permissions.decorator';

/**
 * Lightweight probe for CRM shell permission (guard / Swagger verification).
 */
@ApiTags('rbac')
@ApiBearerAuth()
@Controller({ path: 'rbac', version: '1' })
export class RbacController {
  @Get('me')
  @RequirePermissions(Permissions.CRM_ACCESS_SHELL)
  @ApiOperation({
    summary: 'Return authorization context for the current principal',
    description: `Requires permission ${Permissions.CRM_ACCESS_SHELL}. Returns roles and permissions resolved server-side.`,
  })
  @ApiForbiddenResponse({
    description: `Missing permission (${Permissions.CRM_ACCESS_SHELL}) — ERR-AUTHZ-001`,
  })
  me(@CurrentUser() user: AuthenticatedUser) {
    return {
      id: user.id,
      email: user.email,
      roles: user.roles,
      permissions: user.permissions,
    };
  }
}
