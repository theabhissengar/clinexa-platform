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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CategoryLifecycleStatus } from '../../../generated/prisma';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { Permissions } from '../rbac/constants/permissions';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@ApiTags('admin-categories')
@ApiBearerAuth()
@Controller({ path: 'admin/categories', version: '1' })
export class AdminCategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @RequirePermissions(Permissions.CAT_MANAGE)
  @ApiOperation({ summary: 'Admin category list' })
  list(
    @Query('q') q?: string,
    @Query('status') status?: CategoryLifecycleStatus,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.categories.listAdmin({
      q,
      status,
      skip: skip ? Number(skip) : 0,
      take: take ? Number(take) : 50,
    });
  }

  @Post()
  @RequirePermissions(Permissions.CAT_MANAGE)
  create(@Body() dto: CreateCategoryDto) {
    return this.categories.create(dto);
  }

  @Get(':id')
  @RequirePermissions(Permissions.CAT_MANAGE)
  get(@Param('id') id: string) {
    return this.categories.getAdminById(id);
  }

  @Patch(':id')
  @RequirePermissions(Permissions.CAT_MANAGE)
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categories.update(id, dto);
  }

  @Post(':id/publish')
  @RequirePermissions(Permissions.CAT_MANAGE)
  @HttpCode(HttpStatus.OK)
  publish(@Param('id') id: string) {
    return this.categories.publish(id);
  }

  @Post(':id/unpublish')
  @RequirePermissions(Permissions.CAT_MANAGE)
  @HttpCode(HttpStatus.OK)
  unpublish(@Param('id') id: string) {
    return this.categories.unpublish(id);
  }

  @Delete(':id')
  @RequirePermissions(Permissions.CAT_DELETE)
  @ApiOperation({ summary: 'Delete category (Class D)' })
  remove(@Param('id') id: string) {
    return this.categories.softDelete(id);
  }
}
