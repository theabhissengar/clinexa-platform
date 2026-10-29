"use client";

import { FileText, ImageIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { resolveAsset } from "@/features/assets/api/assets-api";
import { isImageMime } from "@/features/assets/lib/mime-from-filename";
import { cn } from "@/lib/utils";

type AssetThumbProps = {
  assetId: string;
  mimeType: string;
  alt: string;
  status: string;
  className?: string;
};

/**
 * Lazy-resolves Active image assets for gallery tiles. Non-images / non-active show placards.
 */
export function AssetThumb({
  assetId,
  mimeType,
  alt,
  status,
  className,
}: AssetThumbProps) {
  const canResolve = status === "ACTIVE" && isImageMime(mimeType);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!canResolve) {
      setUrl(null);
      setFailed(false);
      return;
    }
    let cancelled = false;
    setFailed(false);
    void resolveAsset(assetId)
      .then((r) => {
        if (!cancelled) setUrl(r.url);
      })
      .catch(() => {
        if (!cancelled) {
          setUrl(null);
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [assetId, canResolve]);

  if (url && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={alt}
        className={cn("size-full object-cover", className)}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }

  const isPdf = mimeType === "application/pdf";
  return (
    <div
      className={cn(
        "flex size-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-muted/80 via-card to-info/10 text-muted-foreground",
        className,
      )}
    >
      {isPdf ? (
        <FileText className="size-8 opacity-70" aria-hidden />
      ) : (
        <ImageIcon className="size-8 opacity-70" aria-hidden />
      )}
      <span className="max-w-[90%] truncate px-2 text-[0.65rem] font-medium uppercase tracking-wider">
        {isPdf ? "PDF" : mimeType.split("/")[1] || mimeType}
      </span>
    </div>
  );
}
