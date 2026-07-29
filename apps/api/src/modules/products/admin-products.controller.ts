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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProductLifecycleStatus, ProductType } from '../../../generated/prisma';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { Permissions } from '../rbac/constants/permissions';
import { ProductMediaAttachmentService } from './product-media-attachment.service';
import { ProductVariantsService } from './product-variants.service';
import { ProductsService } from './products.service';
import {
  AttachMediaDto,
  BulkProductIdsDto,
  CreateProductDto,
  CreateVariantDto,
  ReorderMediaDto,
  SetCategoriesDto,
  TransitionProductDto,
  UpdateVariantDto,
} from './dto/product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@ApiTags('admin-products')
@ApiBearerAuth()
@Controller({ path: 'admin/products', version: '1' })
export class AdminProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly variants: ProductVariantsService,
    private readonly media: ProductMediaAttachmentService,
  ) {}

  @Get()
  @RequirePermissions(Permissions.PRD_MANAGE)
  @ApiOperation({ summary: 'Admin product list (includes drafts)' })
  list(
    @Query('q') q?: string,
    @Query('status') status?: ProductLifecycleStatus,
    @Query('isRxEligible') isRxEligible?: string,
    @Query('isFeatured') isFeatured?: string,
    @Query('productType') productType?: ProductType,
    @Query('categoryId') categoryId?: string,
    @Query('brandName') brandName?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.products.listAdmin({
      q,
      status,
      isRxEligible:
        isRxEligible === undefined ? undefined : isRxEligible === 'true',
      isFeatured:
        isFeatured === undefined ? undefined : isFeatured === 'true',
      productType,
      categoryId,
      brandName,
      skip: skip ? Number(skip) : 0,
      take: take ? Number(take) : 50,
    });
  }

  @Post()
  @RequirePermissions(Permissions.PRD_MANAGE)
  @ApiOperation({ summary: 'Create product (draft)' })
  create(
    @Body() dto: CreateProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.products.create(dto, user.id);
  }

  @Post('bulk-delete')
  @RequirePermissions(Permissions.PRD_DELETE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk soft-delete products (Class D)' })
  bulkDelete(
    @Body() dto: BulkProductIdsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.products.bulkSoftDelete(dto.ids, user.id);
  }

  @Get(':id')
  @RequirePermissions(Permissions.PRD_MANAGE)
  @ApiOperation({ summary: 'Admin product detail' })
  get(@Param('id') id: string) {
    return this.products.getAdminById(id);
  }

  @Patch(':id')
  @RequirePermissions(Permissions.PRD_MANAGE)
  @ApiOperation({ summary: 'Update product' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.products.update(id, dto, user.id);
  }

  @Post(':id/duplicate')
  @RequirePermissions(Permissions.PRD_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Duplicate product as a new draft' })
  duplicate(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.products.duplicate(id, user.id);
  }

  @Post(':id/toggle-featured')
  @RequirePermissions(Permissions.PRD_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Toggle featured flag' })
  toggleFeatured(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.products.toggleFeatured(id, user.id);
  }

  @Post(':id/transition')
  @RequirePermissions(Permissions.PRD_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lifecycle transition (includes publish safety)' })
  transition(
    @Param('id') id: string,
    @Body() dto: TransitionProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.products.transition(id, dto.status, user.id);
  }

  @Post(':id/publish')
  @RequirePermissions(Permissions.PRD_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publish product (OR-14)' })
  publish(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.products.transition(
      id,
      ProductLifecycleStatus.PUBLISHED,
      user.id,
    );
  }

  @Post(':id/unpublish')
  @RequirePermissions(Permissions.PRD_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unpublish product' })
  unpublish(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.products.transition(
      id,
      ProductLifecycleStatus.UNPUBLISHED,
      user.id,
    );
  }

  @Post(':id/archive')
  @RequirePermissions(Permissions.PRD_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive product' })
  archive(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.products.transition(
      id,
      ProductLifecycleStatus.ARCHIVED,
      user.id,
    );
  }

  @Post(':id/restore')
  @RequirePermissions(Permissions.PRD_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore archived product to unpublished' })
  restore(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.products.transition(
      id,
      ProductLifecycleStatus.UNPUBLISHED,
      user.id,
    );
  }

  @Delete(':id')
  @RequirePermissions(Permissions.PRD_DELETE)
  @ApiOperation({ summary: 'Soft-delete product (Class D)' })
  remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.products.softDelete(id, user.id);
  }

  @Put(':id/categories')
  @RequirePermissions(Permissions.PRD_MANAGE)
  @ApiOperation({ summary: 'Set category links' })
  setCategories(
    @Param('id') id: string,
    @Body() dto: SetCategoriesDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.products.setCategories(id, dto.categoryIds, user.id);
  }

  @Get(':id/variants')
  @RequirePermissions(Permissions.PRD_MANAGE)
  listVariants(@Param('id') id: string) {
    return this.variants.list(id);
  }

  @Post(':id/variants')
  @RequirePermissions(Permissions.PRD_MANAGE)
  createVariant(
    @Param('id') id: string,
    @Body() dto: CreateVariantDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.variants.create(id, dto, user.id);
  }

  @Patch(':id/variants/:variantId')
  @RequirePermissions(Permissions.PRD_MANAGE)
  updateVariant(
    @Param('id') id: string,
    @Param('variantId') variantId: string,
    @Body() dto: UpdateVariantDto,
  ) {
    return this.variants.update(id, variantId, dto);
  }

  @Delete(':id/variants/:variantId')
  @RequirePermissions(Permissions.PRD_MANAGE)
  @ApiOperation({ summary: 'Soft-delete a product variant' })
  removeVariant(
    @Param('id') id: string,
    @Param('variantId') variantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.variants.softDelete(id, variantId, user.id);
  }

  @Get(':id/media')
  @RequirePermissions(Permissions.PRD_MANAGE)
  listMedia(@Param('id') id: string) {
    return this.media.list(id);
  }

  @Post(':id/media')
  @RequirePermissions(Permissions.PRD_MANAGE)
  @ApiOperation({
    summary: 'Attach Media Library asset reference (no binary upload)',
  })
  attachMedia(
    @Param('id') id: string,
    @Body() dto: AttachMediaDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.media.attach(id, dto, user.id);
  }

  @Put(':id/media/order')
  @RequirePermissions(Permissions.PRD_MANAGE)
  reorderMedia(@Param('id') id: string, @Body() dto: ReorderMediaDto) {
    return this.media.reorder(id, dto.orderedMediaIds);
  }

  @Delete(':id/media/:mediaId')
  @RequirePermissions(Permissions.PRD_MANAGE)
  detachMedia(
    @Param('id') id: string,
    @Param('mediaId') mediaId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.media.detach(id, mediaId, user.id);
  }

  @Get(':id/history')
  @RequirePermissions(Permissions.PRD_MANAGE)
  history(@Param('id') id: string) {
    return this.products.listHistory(id);
  }

  @Get(':id/activity')
  @RequirePermissions(Permissions.PRD_MANAGE)
  activity(@Param('id') id: string) {
    return this.products.listActivity(id);
  }

  @Get(':id/inventory')
  @RequirePermissions(Permissions.PRD_MANAGE)
  @ApiOperation({
    summary: 'Read-only inventory summary stub (Inventory module owns stock)',
  })
  inventory(@Param('id') id: string) {
    return this.products.inventorySummary(id);
  }
}
