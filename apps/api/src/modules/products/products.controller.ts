import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../auth/decorators/public.decorator';
import { ProductCatalogQueryService } from './product-catalog-query.service';

@ApiTags('products')
@Controller({ path: 'products', version: '1' })
export class ProductsController {
  constructor(private readonly catalog: ProductCatalogQueryService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List published products (Store catalog data)' })
  list(
    @Query('q') q?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.catalog.listPublished({
      q,
      skip: skip ? Number(skip) : 0,
      take: take ? Number(take) : 50,
    });
  }

  @Public()
  @Get('by-slug/:slug')
  @ApiOperation({ summary: 'Published product detail by slug' })
  bySlug(@Param('slug') slug: string) {
    return this.catalog.getPublishedBySlug(slug);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Published product detail by id' })
  byId(@Param('id') id: string) {
    return this.catalog.getPublishedById(id);
  }
}
