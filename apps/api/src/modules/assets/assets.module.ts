import { Module } from '@nestjs/common';

import { StorageModule } from '../../infrastructure/storage/storage.module';
import { AdminAssetsController } from './admin-assets.controller';
import { AssetLifecycleService } from './asset-lifecycle.service';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';

@Module({
  imports: [StorageModule],
  controllers: [AdminAssetsController, AssetsController],
  providers: [AssetsService, AssetLifecycleService],
  exports: [AssetsService],
})
export class AssetsModule {}
