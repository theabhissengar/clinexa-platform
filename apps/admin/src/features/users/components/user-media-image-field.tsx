"use client";

import { ImageIcon, Loader2, Upload, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  createUploadSession,
  finalizeUploadSession,
  resolveAsset,
  uploadSessionContent,
} from "@/features/assets/api/assets-api";
import { cn } from "@/lib/utils";

const IMAGE_ACCEPT = "image/jpeg,image/png,image/gif,image/webp,image/avif";

const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
]);

const ACTION_ICON_CLASS = "size-4 shrink-0";

export function useResolvedAssetUrl(assetId: string | null | undefined) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resolveKey, setResolveKey] = useState(assetId ?? "");

  const key = assetId ?? "";
  if (resolveKey !== key) {
    setResolveKey(key);
    setResolvedUrl(null);
    setLoading(Boolean(assetId));
  }

  useEffect(() => {
    if (!assetId) return;
    let cancelled = false;
    void resolveAsset(assetId)
      .then((resolved) => {
        if (!cancelled) setResolvedUrl(resolved.url);
      })
      .catch(() => {
        if (!cancelled) setResolvedUrl(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [assetId]);

  return { url: assetId ? resolvedUrl : null, loading: assetId ? loading : false };
}

export async function uploadImageAsset(file: File): Promise<string> {
  if (!ALLOWED.has(file.type)) {
    throw new Error(`Unsupported image type: ${file.type || "unknown"}`);
  }
  const session = await createUploadSession({
    originalFilename: file.name,
    mimeType: file.type,
  });
  await uploadSessionContent(session.id, file);
  const asset = await finalizeUploadSession(session.id);
  return asset.id;
}

type UserMediaImageFieldProps = {
  label: string;
  hint?: string;
  value: string | null;
  onChange: (next: string | null) => void;
  aspect?: "square" | "portrait" | "wide";
  rounded?: "xl" | "full";
  /** Distinct media-well styling vs neutral form fields */
  tone?: "default" | "media";
  className?: string;
};

export function UserMediaImageField({
  label,
  hint,
  value,
  onChange,
  aspect = "square",
  rounded = "xl",
  tone = "default",
  className,
}: UserMediaImageFieldProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const { url: remoteUrl, loading: resolving } = useResolvedAssetUrl(value);
  const preview = localPreview ?? remoteUrl;
  const media = tone === "media";
  const isCircle = rounded === "full";

  useEffect(() => {
    return () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  async function onPick(file: File | null) {
    if (!file) return;
    setError(null);
    setBusy(true);
    const objectUrl = URL.createObjectURL(file);
    setLocalPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return objectUrl;
    });
    try {
      const assetId = await uploadImageAsset(file);
      onChange(assetId);
    } catch {
      setError("Upload failed. Try another image.");
      setLocalPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onClear() {
    setError(null);
    setLocalPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    onChange(null);
  }

  return (
    <div className={cn("flex min-w-0 flex-col space-y-2", className)}>
      <div className="space-y-0.5">
        <label
          htmlFor={inputId}
          className={cn(
            "text-sm font-medium",
            media
              ? "text-[#1c1c1c] dark:text-[#f4f1ea]"
              : "text-foreground",
          )}
        >
          {label}
        </label>
        {hint ? (
          <p
            className={cn(
              "text-xs",
              media
                ? "text-[#6b675f] dark:text-white/55"
                : "text-muted-foreground",
            )}
          >
            {hint}
          </p>
        ) : null}
      </div>
      <div
        className={cn(
          "relative mx-auto w-full max-w-full overflow-hidden border border-dashed",
          media
            ? "border-[#cfc7b6] bg-[#ebe5da] dark:border-white/15 dark:bg-[#2a2e36]"
            : "border-border/90 bg-muted/30",
          isCircle
            ? "aspect-square max-w-[11rem] rounded-full sm:max-w-[12rem]"
            : "rounded-2xl",
          !isCircle && aspect === "square" && "aspect-square max-w-xs",
          !isCircle && aspect === "portrait" && "aspect-3/4 max-w-[14rem]",
          !isCircle && aspect === "wide" && "aspect-16/10",
        )}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="size-full object-cover" />
        ) : (
          <div
            className={cn(
              "flex size-full flex-col items-center justify-center gap-1.5 text-center",
              isCircle ? "p-3" : "p-4",
              media
                ? "text-[#6b675f] dark:text-white/50"
                : "text-muted-foreground",
            )}
          >
            {resolving ? (
              <Loader2 className="size-5 shrink-0 animate-spin" aria-hidden />
            ) : (
              <ImageIcon className="size-5 shrink-0 opacity-70" aria-hidden />
            )}
            {!isCircle ? (
              <span className="text-xs leading-none">No image</span>
            ) : (
              <span className="sr-only">No image</span>
            )}
          </div>
        )}
        {busy ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/45 text-white">
            <Loader2 className="size-5 shrink-0 animate-spin" aria-hidden />
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn(
            "h-8 gap-1.5 px-2.5 [&_svg]:size-4",
            media &&
              "border-[#1c1c1c]/20 bg-[#1c1c1c] text-[#efd56a] hover:bg-[#2a2a2a] hover:text-[#efd56a] dark:border-white/15 dark:bg-[#efd56a] dark:text-[#1c1c1c] dark:hover:bg-[#f0dc7e]",
          )}
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className={ACTION_ICON_CLASS} aria-hidden />
          <span>{preview ? "Replace" : "Upload"}</span>
        </Button>
        {value || localPreview ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={cn(
              "h-8 gap-1.5 px-2 [&_svg]:size-4",
              media &&
                "text-[#6b675f] hover:bg-black/5 hover:text-[#1c1c1c] dark:text-white/65 dark:hover:bg-white/10 dark:hover:text-white",
            )}
            disabled={busy}
            onClick={onClear}
          >
            <X className={ACTION_ICON_CLASS} aria-hidden />
            <span>Remove</span>
          </Button>
        ) : null}
      </div>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={IMAGE_ACCEPT}
        className="sr-only"
        onChange={(e) => void onPick(e.target.files?.[0] ?? null)}
      />
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type UserAvatarThumbProps = {
  assetId?: string | null;
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

export function UserAvatarThumb({
  assetId,
  name,
  size = "sm",
  className,
}: UserAvatarThumbProps) {
  const { url, loading } = useResolvedAssetUrl(assetId);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#2a261c] text-[#efd56a] ring-1 ring-black/10 dark:ring-white/15",
        size === "sm" && "size-8 text-[11px] font-semibold",
        size === "md" && "size-11 text-sm font-semibold",
        size === "lg" && "size-14 text-base font-semibold",
        className,
      )}
      aria-hidden={Boolean(url)}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="size-full object-cover" />
      ) : loading ? (
        <Loader2 className="size-3.5 shrink-0 animate-spin opacity-70" />
      ) : (
        <span>{initials || "?"}</span>
      )}
    </span>
  );
}
