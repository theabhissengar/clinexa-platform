import { StorageProviderKind } from '../../../generated/prisma';

export type StorageObjectMeta = {
  key: string;
  mimeType: string;
  byteSize: number;
};

export type PutObjectInput = {
  key: string;
  body: Buffer;
  mimeType: string;
};

export type ResolvedObject = {
  /** Provider-independent display URL or API path consumers may use. */
  url: string;
  mimeType: string;
  byteSize: number;
  /** When true, url is a short-lived signed/local path rather than a permanent CDN URL. */
  ephemeral: boolean;
};

/**
 * Shared object-storage abstraction (docs/33 §8).
 * Asset Library, Document Management, and User Media all depend on this interface —
 * they never import vendor SDKs directly.
 */
export interface StorageProvider {
  readonly kind: StorageProviderKind;

  putObject(input: PutObjectInput): Promise<StorageObjectMeta>;

  getObject(key: string): Promise<{ body: Buffer; mimeType: string }>;

  deleteObject(key: string): Promise<void>;

  exists(key: string): Promise<boolean>;

  /**
   * Resolve a display/download location. Must not expose provider credentials.
   */
  resolveUrl(
    key: string,
    mimeType: string,
    byteSize: number,
  ): Promise<ResolvedObject>;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
