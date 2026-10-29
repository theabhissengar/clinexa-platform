"use client";

import { FileText, Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  getAdminAsset,
  resolveAsset,
  updateAsset,
} from "@/features/assets/api/assets-api";
import {
  AssetLibraryHeader,
  AssetLibraryShell,
} from "@/features/assets/components/asset-library-shell";
import {
  formatAssetBytes,
  isImageMime,
} from "@/features/assets/lib/mime-from-filename";
import type { Asset } from "@/features/assets/types";

export function AssetEditPage() {
  const params = useParams<{ id: string }>();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [originalFilename, setOriginalFilename] = useState("");
  const [altText, setAltText] = useState("");
  const [caption, setCaption] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getAdminAsset(params.id)
      .then((a) => {
        setAsset(a);
        setOriginalFilename(a.originalFilename);
        setAltText(a.altText ?? "");
        setCaption(a.caption ?? "");
      })
      .catch(() => setError("Unable to load asset."));
    void resolveAsset(params.id)
      .then((r) => setPreviewUrl(r.url))
      .catch(() => setPreviewUrl(null));
  }, [params.id]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    const name = originalFilename.trim();
    if (!name) {
      setError("Name is required.");
      toast.error("Name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateAsset(params.id, {
        originalFilename: name,
        altText: altText || null,
        caption: caption || null,
      });
      setAsset(updated);
      setOriginalFilename(updated.originalFilename);
      toast.success("Metadata saved.");
    } catch {
      setError("Unable to save metadata.");
      toast.error("Unable to save metadata.");
    } finally {
      setSaving(false);
    }
  }

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
    <AssetLibraryShell backHref="/guardian/assets" className="pb-4">
      <AssetLibraryHeader
        className="mb-4 sm:mb-5"
        compact
        eyebrow="Metadata"
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

      {error && !asset ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {asset ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-stretch lg:gap-6">
          <div className="flex min-h-0 flex-col gap-2">
            <Link
              href={`/guardian/assets/${params.id}`}
              className="w-fit text-sm font-medium text-info hover:underline"
            >
              View Image
            </Link>
            <div className="flex min-h-48 flex-1 flex-col overflow-hidden rounded-xl border border-border/70 bg-card/70 shadow-sm backdrop-blur-sm sm:min-h-56 sm:rounded-2xl">
              <div className="flex flex-1 items-center justify-center bg-linear-to-br from-muted/60 via-card to-info/10 p-3 sm:p-4">
                {showImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewUrl}
                    alt={altText || asset.originalFilename}
                    className="max-h-full max-w-full rounded-lg object-contain shadow-md"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 px-3 py-6 text-muted-foreground">
                    <FileText className="size-8 opacity-60 sm:size-10" />
                    <p className="text-center text-xs sm:text-sm">
                      {isImageMime(asset.mimeType)
                        ? "Preview unavailable (asset may not be Active)."
                        : "No image preview for this type."}
                    </p>
                  </div>
                )}
              </div>
              <div className="border-t border-border/60 px-3 py-2 sm:px-4">
                <p className="font-mono text-[0.65rem] break-all text-muted-foreground">
                  {params.id}
                </p>
              </div>
            </div>
          </div>

          <form
            onSubmit={onSave}
            className="flex h-full flex-col justify-center space-y-3.5 rounded-xl border border-border/70 bg-card/80 p-4 shadow-sm backdrop-blur-sm sm:space-y-4 sm:rounded-2xl sm:p-5"
          >
            <div className="space-y-1.5">
              <Label htmlFor="asset-name">Name</Label>
              <Input
                id="asset-name"
                value={originalFilename}
                onChange={(e) => setOriginalFilename(e.target.value)}
                placeholder="Display name (e.g. hero-banner.jpg)"
                maxLength={512}
                required
                className="bg-muted/30"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="asset-alt">Alt text</Label>
              <Input
                id="asset-alt"
                value={altText}
                onChange={(e) => setAltText(e.target.value)}
                placeholder="Describe the image for accessibility"
                className="bg-muted/30"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="asset-caption">Caption</Label>
              <Input
                id="asset-caption"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Optional caption"
                className="bg-muted/30"
              />
            </div>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2 pt-0.5">
              <Button
                type="submit"
                disabled={saving}
                className="border-transparent bg-success text-success-foreground hover:bg-success/90"
              >
                {saving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  "Save metadata"
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                render={<Link href="/guardian/assets" />}
              >
                Back to library
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </AssetLibraryShell>
  );
}
