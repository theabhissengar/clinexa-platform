import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { StorageProviderKind } from '../../../generated/prisma';

import type {
  PutObjectInput,
  ResolvedObject,
  StorageObjectMeta,
  StorageProvider,
} from './storage-provider.interface';

/**
 * Local filesystem StorageProvider (V1).
 * Keys are stored under STORAGE_LOCAL_ROOT with module prefixes (e.g. assets/…).
 */
@Injectable()
export class LocalStorageProvider implements StorageProvider {
  readonly kind = StorageProviderKind.LOCAL;
  private readonly logger = new Logger(LocalStorageProvider.name);
  private readonly root: string;
  private readonly publicBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.root = this.config.get<string>('storage.localRoot')!;
    this.publicBaseUrl = this.config
      .get<string>('storage.publicBaseUrl')!
      .replace(/\/$/, '');
  }

  private resolvePath(key: string): string {
    const normalized = key.replace(/^[/\\]+/, '').replace(/\.\./g, '');
    return path.join(this.root, normalized);
  }

  async putObject(input: PutObjectInput): Promise<StorageObjectMeta> {
    const fullPath = this.resolvePath(input.key);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, input.body);
    this.logger.debug(
      `Stored local object ${input.key} (${input.body.length} bytes)`,
    );
    return {
      key: input.key,
      mimeType: input.mimeType,
      byteSize: input.body.length,
    };
  }

  async getObject(key: string): Promise<{ body: Buffer; mimeType: string }> {
    const fullPath = this.resolvePath(key);
    const body = await fs.readFile(fullPath);
    return { body, mimeType: 'application/octet-stream' };
  }

  async deleteObject(key: string): Promise<void> {
    const fullPath = this.resolvePath(key);
    try {
      await fs.unlink(fullPath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        throw err;
      }
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolvePath(key));
      return true;
    } catch {
      return false;
    }
  }

  resolveUrl(
    key: string,
    mimeType: string,
    byteSize: number,
  ): Promise<ResolvedObject> {
    // Local resolve goes through the API stream endpoint (no raw filesystem paths to clients).
    return Promise.resolve({
      url: `${this.publicBaseUrl}/v1/assets/file?key=${encodeURIComponent(key)}`,
      mimeType,
      byteSize,
      ephemeral: true,
    });
  }
}
