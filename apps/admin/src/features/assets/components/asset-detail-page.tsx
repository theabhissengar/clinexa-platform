"use client";

import { FileText, Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAdminAsset, resolveAsset } from "@/features/assets/api/assets-api";
import {
  AssetLibraryHeader,
  AssetLibraryShell,
} from "@/features/assets/components/asset-library-shell";
import {
  formatAssetBytes,
  isImageMime,
} from "@/features/assets/lib/mime-from-filename";
import type { Asset } from "@/features/assets/types";
import { usePermissions } from "@/features/auth/hooks/use-permissions";
import { Permissions } from "@/features/auth/permissions";

export function AssetDetailPage() {
  const params = useParams<{ id: string }>();
  const { can } = usePermissions();
  const canManage = can(Permissions.AST_MANAGE);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getAdminAsset(params.id)
      .then(setAsset)
      .catch(() => setError("Unable to load asset."));
    void resolveAsset(params.id)
      .then((r) => setPreviewUrl(r.url))
      .catch(() => setPreviewUrl(null));
  }, [params.id]);

  if (!asset && !error) {
    return (
      <AssetLibraryShell backHref="/guardian/assets">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading asset…
        </p>
      </AssetLibraryShell>
    );
  }

  const showImage = previewUrl && asset && isImageMime(asset.mimeType);

  return (
    <AssetLibraryShell backHref="/guardian/assets">
      <AssetLibraryHeader
        eyebrow="Preview"
        title={asset?.originalFilename ?? "Asset"}
        description={
          asset
            ? `${asset.mimeType} · ${formatAssetBytes(asset.byteSize)}`
            : undefined
        }
        actions={
          asset ? (
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={asset.status} />
              {canManage ? (
                <Button
                  size="sm"
                  className="border-transparent bg-info text-info-foreground hover:bg-info/90"
                  render={<Link href={`/guardian/assets/${params.id}/edit`} />}
                >
                  Edit metadata
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                render={<Link href={`/guardian/assets/${params.id}/history`} />}
              >
                History
              </Button>
              <Button
                size="sm"
                variant="outline"
                render={
                  <Link href={`/guardian/assets/${params.id}/activity`} />
                }
              >
                Activity
              </Button>
            </div>
          ) : null
        }
      />

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {asset ? (
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/70 shadow-sm backdrop-blur-sm">
          <div className="flex min-h-[16rem] items-center justify-center bg-gradient-to-br from-muted/60 via-card to-info/10 p-6 sm:min-h-[22rem]">
            {showImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt={asset.altText || asset.originalFilename}
                className="max-h-[28rem] max-w-full rounded-lg object-contain shadow-md"
              />
            ) : (
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <FileText className="size-12 opacity-60" />
                <p className="text-sm">
                  {isImageMime(asset.mimeType)
                    ? "Preview unavailable (asset may not be Active)."
                    : "No image preview for this type."}
                </p>
              </div>
            )}
          </div>
          <div className="space-y-2 border-t border-border/60 px-5 py-4">
            {asset.altText ? (
              <p className="text-sm">
                <span className="text-muted-foreground">Alt · </span>
                {asset.altText}
              </p>
            ) : null}
            {asset.caption ? (
              <p className="text-sm">
                <span className="text-muted-foreground">Caption · </span>
                {asset.caption}
              </p>
            ) : null}
            <p className="font-mono text-[0.65rem] break-all text-muted-foreground">
              {params.id}
            </p>
          </div>
        </div>
      ) : null}
    </AssetLibraryShell>
  );
}
