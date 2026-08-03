import {
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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AssetStatus } from '../../../generated/prisma';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { Permissions } from '../rbac/constants/permissions';
import { AssetsService } from './assets.service';
import {
  BulkAssetIdsDto,
  CreateUploadSessionDto,
  UpdateAssetDto,
} from './dto/asset.dto';

type MulterFile = {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
};

@ApiTags('admin-assets')
@ApiBearerAuth()
@Controller({ path: 'admin/assets', version: '1' })
export class AdminAssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  @RequirePermissions(Permissions.AST_VIEW)
  @ApiOperation({ summary: 'List / browse Asset Library' })
  list(
    @Query('q') q?: string,
    @Query('status') status?: AssetStatus,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.assets.listAdmin({
      q,
      status,
      skip: skip ? Number(skip) : 0,
      take: take ? Number(take) : 50,
    });
  }

  @Get('picker')
  @RequirePermissions(Permissions.AST_VIEW)
  @ApiOperation({
    summary: 'Asset picker foundation (Active assets only; no upload)',
  })
  picker(
    @Query('q') q?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.assets.listPicker({
      q,
      skip: skip ? Number(skip) : 0,
      take: take ? Number(take) : 50,
    });
  }

  @Post('upload-sessions')
  @RequirePermissions(Permissions.AST_MANAGE)
  @ApiOperation({ summary: 'Start asset upload session' })
  createSession(
    @Body() dto: CreateUploadSessionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assets.createUploadSession(dto, user.id);
  }

  @Put('upload-sessions/:sessionId/content')
  @RequirePermissions(Permissions.AST_MANAGE)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    summary: 'Upload binary content for a session (Local provider)',
  })
  putContent(
    @Param('sessionId') sessionId: string,
    @UploadedFile() file: MulterFile,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file?.buffer?.length) {
      return this.assets.putSessionContent(sessionId, user.id, Buffer.alloc(0));
    }
    return this.assets.putSessionContent(
      sessionId,
      user.id,
      file.buffer,
      file.mimetype,
    );
  }

  @Post('upload-sessions/:sessionId/finalize')
  @RequirePermissions(Permissions.AST_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Finalize upload → Uploaded then Active' })
  finalize(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assets.finalizeSession(sessionId, user.id);
  }

  @Post('bulk')
  @RequirePermissions(Permissions.AST_BULK_DESTRUCTIVE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bounded bulk archive/delete (Class D)' })
  bulk(@Body() dto: BulkAssetIdsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.assets.bulkDestructive(
      dto.ids,
      dto.action === 'archive' ? 'archive' : 'delete',
      user.id,
    );
  }

  @Get(':id')
  @RequirePermissions(Permissions.AST_VIEW)
  @ApiOperation({ summary: 'Get asset metadata' })
  get(@Param('id') id: string) {
    return this.assets.getAdminById(id);
  }

  @Patch(':id')
  @RequirePermissions(Permissions.AST_MANAGE)
  @ApiOperation({ summary: 'Update asset metadata (alt, caption)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAssetDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assets.updateMetadata(id, dto, user.id);
  }

  @Post(':id/archive')
  @RequirePermissions(Permissions.AST_DESTRUCTIVE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive asset (Class D)' })
  archive(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.assets.archive(id, user.id);
  }

  @Post(':id/restore')
  @RequirePermissions(Permissions.AST_DESTRUCTIVE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore asset to Active (Class D)' })
  restore(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.assets.restore(id, user.id);
  }

  @Delete(':id')
  @RequirePermissions(Permissions.AST_DESTRUCTIVE)
  @ApiOperation({ summary: 'Soft-delete asset (Class D)' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.assets.softDelete(id, user.id);
  }

  @Get(':id/history')
  @RequirePermissions(Permissions.AST_VIEW)
  @ApiOperation({ summary: 'Asset change history' })
  history(@Param('id') id: string) {
    return this.assets.listHistory(id);
  }

  @Get(':id/activity')
  @RequirePermissions(Permissions.AST_VIEW)
  @ApiOperation({ summary: 'Asset activity' })
  activity(@Param('id') id: string) {
    return this.assets.listActivity(id);
  }
}
