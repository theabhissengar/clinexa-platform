import { registerAs } from '@nestjs/config';

export default registerAs('storage', () => ({
  /** Active StorageProvider kind for Asset Library (V1: local). */
  provider: (process.env.STORAGE_PROVIDER ?? 'local').toLowerCase(),
  localRoot:
    process.env.STORAGE_LOCAL_ROOT ?? `${process.cwd()}/.data/object-storage`,
  /** Public/API base used to build resolve URLs for local files. */
  publicBaseUrl:
    process.env.STORAGE_PUBLIC_BASE_URL ??
    `http://localhost:${process.env.PORT ?? 3001}`,
  maxUploadBytes: Number(
    process.env.STORAGE_MAX_UPLOAD_BYTES ?? 10 * 1024 * 1024,
  ),
  uploadSessionTtlMinutes: Number(
    process.env.STORAGE_UPLOAD_SESSION_TTL_MINUTES ?? 60,
  ),
}));
