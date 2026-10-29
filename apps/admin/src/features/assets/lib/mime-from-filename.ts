const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
  pdf: "application/pdf",
};

export const ASSET_ALLOWED_MIMES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
  "image/avif",
] as const;

export const ASSET_ACCEPT =
  "image/jpeg,image/png,image/gif,image/webp,image/svg+xml,image/avif,application/pdf,.jpg,.jpeg,.png,.gif,.webp,.svg,.avif,.pdf";

/** Soft client hint — server enforces ~10MB. */
export const ASSET_MAX_BYTES = 10 * 1024 * 1024;

export function mimeFromFilename(filename: string): string | null {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (!ext) return null;
  return EXT_TO_MIME[ext] ?? null;
}

export function resolveFileMime(file: File): string | null {
  if (file.type && ASSET_ALLOWED_MIMES.includes(file.type as (typeof ASSET_ALLOWED_MIMES)[number])) {
    return file.type;
  }
  const fromName = mimeFromFilename(file.name);
  if (fromName && ASSET_ALLOWED_MIMES.includes(fromName as (typeof ASSET_ALLOWED_MIMES)[number])) {
    return fromName;
  }
  return file.type || fromName;
}

export function formatAssetBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function isImageMime(mime: string) {
  return mime.startsWith("image/");
}
