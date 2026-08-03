import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { StorageProviderKind } from '../../../generated/prisma';

import { LocalStorageProvider } from './local-storage.provider';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from './storage-provider.interface';

/**
 * Future providers (S3, R2, Azure, GCS) register behind STORAGE_PROVIDER
 * without changing Asset Library business services.
 */
@Module({
  imports: [ConfigModule],
  providers: [
    LocalStorageProvider,
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService, LocalStorageProvider],
      useFactory: (
        config: ConfigService,
        local: LocalStorageProvider,
      ): StorageProvider => {
        const kind = (
          config.get<string>('storage.provider') ?? 'local'
        ).toLowerCase();
        if (
          kind === 'local' ||
          kind === StorageProviderKind.LOCAL.toLowerCase()
        ) {
          return local;
        }
        // Interface-compatible stubs for future providers — Local remains V1 default.
        throw new Error(
          `Storage provider "${kind}" is not implemented yet. Use STORAGE_PROVIDER=local.`,
        );
      },
    },
  ],
  exports: [STORAGE_PROVIDER, LocalStorageProvider],
})
export class StorageModule {}
