import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../auth/decorators/public.decorator';
import { CategoriesService } from './categories.service';

@ApiTags('categories')
@Controller({ path: 'categories', version: '1' })
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List published categories' })
  list() {
    return this.categories.listPublished();
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Published category by slug' })
  bySlug(@Param('slug') slug: string) {
    return this.categories.getPublishedBySlug(slug);
  }
}
