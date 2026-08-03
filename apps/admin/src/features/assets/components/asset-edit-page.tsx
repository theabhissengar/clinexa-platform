"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getAdminAsset,
  resolveAsset,
  updateAsset,
} from "@/features/assets/api/assets-api";
import type { Asset } from "@/features/assets/types";

export function AssetEditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [altText, setAltText] = useState("");
  const [caption, setCaption] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getAdminAsset(params.id)
      .then((a) => {
        setAsset(a);
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
    setSaving(true);
    setError(null);
    try {
      const updated = await updateAsset(params.id, {
        altText: altText || null,
        caption: caption || null,
      });
      setAsset(updated);
      router.refresh();
    } catch {
      setError("Unable to save metadata.");
    } finally {
      setSaving(false);
    }
  }

  if (!asset && !error) {
    return (
      <main className="px-6 py-10 text-sm text-muted-foreground">
        Loading asset…
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <Link
          href="/guardian/assets"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Asset Library
        </Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">
          {asset?.originalFilename ?? "Asset"}
        </h1>
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          {params.id}
        </p>
      </div>
      {previewUrl && asset?.mimeType.startsWith("image/") ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt={altText || asset.originalFilename}
          className="max-h-64 rounded-md border border-border object-contain"
        />
      ) : null}
      <form onSubmit={onSave} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            Alt text
          </label>
          <Input value={altText} onChange={(e) => setAltText(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            Caption
          </label>
          <Input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
          />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            variant="outline"
            render={<Link href={`/guardian/assets/${params.id}/history`} />}
          >
            History
          </Button>
          <Button
            type="button"
            variant="outline"
            render={<Link href={`/guardian/assets/${params.id}/activity`} />}
          >
            Activity
          </Button>
        </div>
      </form>
    </main>
  );
}
