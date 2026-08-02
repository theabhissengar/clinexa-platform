import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { Permissions } from '../rbac/constants/permissions';
import { UpdateOwnProfileDto } from './dto/user.dto';
import { UsersService } from './users.service';

@ApiTags('profile')
@ApiBearerAuth()
@Controller({ path: 'profile', version: '1' })
export class ProfileController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions(Permissions.PRT_VIEW_OWN_PROFILE)
  @ApiOperation({ summary: 'Get own profile (API-016)' })
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.users.getOwnProfile(user.id);
  }

  @Patch()
  @RequirePermissions(Permissions.PRT_UPDATE_OWN_PROFILE)
  @ApiOperation({
    summary: 'Update own profile allowlist (API-017); no role self-escalation',
  })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateOwnProfileDto,
  ) {
    return this.users.updateOwnProfile(user.id, dto);
  }
}
