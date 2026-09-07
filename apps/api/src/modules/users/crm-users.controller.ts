import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserStatus, NoteVisibility } from '../../../generated/prisma';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { Permissions } from '../rbac/constants/permissions';
import { CrmUpdateUserDto } from './dto/user.dto';
import { AddNoteDto } from '../../common/dto/note.dto';
import { UsersService } from './users.service';

/**
 * CRM operational Users — field allowlist only.
 * Never exposes Class D archive/restore/delete.
 */
@ApiTags('crm-users')
@ApiBearerAuth()
@Controller({ path: 'crm/users', version: '1' })
export class CrmUsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions(Permissions.CRM_PATIENT_RECORDS)
  @ApiOperation({ summary: 'CRM operational user/patient list' })
  list(
    @Query('q') q?: string,
    @Query('status') status?: UserStatus | 'ALL',
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.users.listCrm({
      q,
      status,
      skip: skip ? Number(skip) : 0,
      take: take ? Number(take) : 50,
    });
  }

  @Get(':id')
  @RequirePermissions(Permissions.CRM_PATIENT_RECORDS)
  @ApiOperation({ summary: 'CRM operational user detail' })
  get(@Param('id') id: string) {
    return this.users.getCrmById(id);
  }

  @Patch(':id')
  @RequirePermissions(Permissions.CRM_PATIENT_RECORDS)
  @ApiOperation({
    summary: 'CRM operational field update (no Class D / no roles)',
  })
  update(
    @Param('id') id: string,
    @Body() dto: CrmUpdateUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.users.updateCrm(id, dto, user.id);
  }

  @Get(':id/notes')
  @RequirePermissions(Permissions.CRM_PATIENT_RECORDS)
  @ApiOperation({ summary: 'List user notes (CRM)' })
  notes(@Param('id') id: string) {
    return this.users.listNotes(id);
  }

  @Post(':id/notes')
  @RequirePermissions(Permissions.CRM_PATIENT_RECORDS)
  @ApiOperation({ summary: 'Add user note (CRM)' })
  addNote(
    @Param('id') id: string,
    @Body() dto: AddNoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.users.addNote({
      userId: id,
      authorUserId: user.id,
      body: dto.body,
      visibility: dto.visibility ?? NoteVisibility.PRIVATE,
    });
  }
}
