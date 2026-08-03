import { Module, forwardRef } from '@nestjs/common';

import { InventoryModule } from '../inventory/inventory.module';
import { AdminProductsController } from './admin-products.controller';
import { ProductCatalogQueryService } from './product-catalog-query.service';
import { ProductLifecycleService } from './product-lifecycle.service';
import { ProductMediaAttachmentService } from './product-media-attachment.service';
import { ProductVariantsService } from './product-variants.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [forwardRef(() => InventoryModule)],
  controllers: [ProductsController, AdminProductsController],
  providers: [
    ProductsService,
    ProductLifecycleService,
    ProductVariantsService,
    ProductMediaAttachmentService,
    ProductCatalogQueryService,
  ],
  exports: [ProductsService, ProductCatalogQueryService],
})
export class ProductsModule {}
