import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { Permissions } from '../rbac/constants/permissions';
import { SetRolePermissionsDto } from './dto/user.dto';
import { RolesAdminService } from './roles-admin.service';

@ApiTags('admin-roles')
@ApiBearerAuth()
@Controller({ path: 'admin', version: '1' })
export class AdminRolesController {
  constructor(private readonly roles: RolesAdminService) {}

  @Get('roles')
  @RequirePermissions(Permissions.ADM_ASSIGN_ROLES)
  @ApiOperation({ summary: 'List roles (API-168)' })
  listRoles() {
    return this.roles.listRoles();
  }

  @Get('roles/:id')
  @RequirePermissions(Permissions.ADM_ASSIGN_ROLES)
  @ApiOperation({ summary: 'Get role with permission codes' })
  getRole(@Param('id') id: string) {
    return this.roles.getRole(id);
  }

  @Get('permissions')
  @RequirePermissions(Permissions.ADM_ASSIGN_ROLES)
  @ApiOperation({ summary: 'Permission dictionary (API-169)' })
  listPermissions() {
    return this.roles.listPermissions();
  }

  @Put('roles/:id/permissions')
  @RequirePermissions(Permissions.ADM_ASSIGN_ROLES)
  @ApiOperation({
    summary:
      'Set role permissions (API-170); audited; clinical gates protected',
  })
  setPermissions(@Param('id') id: string, @Body() dto: SetRolePermissionsDto) {
    return this.roles.setRolePermissions(id, dto.permissionCodes);
  }
}
