import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserStatus } from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuthService } from '../auth/auth.service';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { Permissions } from '../rbac/constants/permissions';
import {
  CreateUserDto,
  ReplaceUserRolesDto,
  SetUserPasswordDto,
  TransitionUserDto,
  UpdateUserDto,
} from './dto/user.dto';
import { UsersService } from './users.service';

@ApiTags('admin-users')
@ApiBearerAuth()
@Controller({ path: 'admin/users', version: '1' })
export class AdminUsersController {
  constructor(
    private readonly users: UsersService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  @RequirePermissions(Permissions.ADM_MANAGE_USERS)
  @ApiOperation({ summary: 'Admin user list with status/role filters' })
  list(
    @Query('q') q?: string,
    @Query('status') status?: UserStatus | 'ALL',
    @Query('role') role?: string,
    @Query('kind') kind?: 'staff' | 'patient',
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.users.listAdmin({
      q,
      status,
      role,
      kind,
      skip: skip ? Number(skip) : 0,
      take: take ? Number(take) : 50,
    });
  }

  @Post()
  @RequirePermissions(Permissions.ADM_MANAGE_USERS)
  @ApiOperation({ summary: 'Create staff user (Guardian)' })
  create(@Body() dto: CreateUserDto, @CurrentUser() user: AuthenticatedUser) {
    return this.users.createStaff(dto, user.id);
  }

  @Get(':id')
  @RequirePermissions(Permissions.ADM_MANAGE_USERS)
  @ApiOperation({ summary: 'Admin user detail' })
  get(@Param('id') id: string) {
    return this.users.getAdminById(id);
  }

  @Patch(':id')
  @RequirePermissions(Permissions.ADM_MANAGE_USERS)
  @ApiOperation({ summary: 'Update user (Guardian administrative fields)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.users.updateAdmin(id, dto, user.id);
  }

  @Get(':id/roles')
  @RequirePermissions(Permissions.ADM_MANAGE_USERS)
  @ApiOperation({ summary: 'List active role assignments on a user' })
  listUserRoles(@Param('id') id: string) {
    return this.users.listRoles(id);
  }

  @Put(':id/roles')
  @RequirePermissions(Permissions.ADM_ASSIGN_ROLES)
  @ApiOperation({ summary: 'Replace role assignments on a user' })
  replaceRoles(
    @Param('id') id: string,
    @Body() dto: ReplaceUserRolesDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.users.replaceRoles(id, dto.roleCodes, user.id);
  }

  @Post(':id/suspend')
  @RequirePermissions(Permissions.ADM_MANAGE_USERS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspend user (non–Class D)' })
  suspend(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.users.suspend(id, user.id);
  }

  @Post(':id/deactivate')
  @RequirePermissions(Permissions.ADM_MANAGE_USERS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate user → inactive (non–Class D)' })
  deactivate(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.users.deactivate(id, user.id);
  }

  @Post(':id/reactivate')
  @RequirePermissions(Permissions.ADM_MANAGE_USERS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactivate suspended/inactive user' })
  reactivate(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.users.reactivate(id, user.id);
  }

  @Post(':id/transition')
  @RequirePermissions(Permissions.ADM_MANAGE_USERS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Non–Class D lifecycle transition (suspend/inactive/reactivate). Use archive/restore/delete for Class D.',
  })
  transition(
    @Param('id') id: string,
    @Body() dto: TransitionUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (
      dto.status === UserStatus.ARCHIVED ||
      dto.status === UserStatus.DELETED
    ) {
      throw new BadRequestException({
        code: ErrorCodes.USR_INVALID_TRANSITION,
        message:
          'Class D transitions require /archive, /restore, or DELETE endpoints',
      });
    }
    return this.users.transition(id, dto.status, user.id);
  }

  @Post(':id/archive')
  @RequirePermissions(Permissions.ADM_ARCHIVE_USER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive user (Class D)' })
  archive(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.users.archive(id, user.id);
  }

  @Post(':id/restore')
  @RequirePermissions(Permissions.ADM_RESTORE_USER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore archived/deleted user (Class D)' })
  restore(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.users.restore(id, user.id);
  }

  @Delete(':id')
  @RequirePermissions(Permissions.ADM_DELETE_USER)
  @ApiOperation({ summary: 'Soft-delete user (Class D)' })
  softDelete(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.users.softDelete(id, user.id);
  }

  @Post(':id/password-reset')
  @RequirePermissions(Permissions.ADM_MANAGE_USERS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request password reset (calls Auth; does not hash in Users)',
  })
  async requestPasswordReset(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const result = await this.auth.requestPasswordResetForUser(id);
    await this.users.recordActivityPublic(
      id,
      user.id,
      'password_reset_requested',
      'Password reset requested by admin',
    );
    return result;
  }

  @Post(':id/set-password')
  @RequirePermissions(Permissions.ADM_MANAGE_USERS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set password via Auth (admin assist; Auth hashes credentials)',
  })
  async setPassword(
    @Param('id') id: string,
    @Body() dto: SetUserPasswordDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.auth.setPasswordForUser(id, dto.password);
    await this.users.recordActivityPublic(
      id,
      user.id,
      'password_set',
      'Password set by admin',
    );
    return { success: true };
  }

  @Get(':id/history')
  @RequirePermissions(Permissions.ADM_MANAGE_USERS)
  @ApiOperation({ summary: 'User change history' })
  history(@Param('id') id: string) {
    return this.users.listHistory(id);
  }

  @Get(':id/activity')
  @RequirePermissions(Permissions.ADM_MANAGE_USERS)
  @ApiOperation({ summary: 'User activity trail' })
  activity(@Param('id') id: string) {
    return this.users.listActivity(id);
  }
}
