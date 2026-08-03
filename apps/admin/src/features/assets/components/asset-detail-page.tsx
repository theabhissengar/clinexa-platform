"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { getAdminAsset, resolveAsset } from "@/features/assets/api/assets-api";
import type { Asset } from "@/features/assets/types";

export function AssetDetailPage() {
  const params = useParams<{ id: string }>();
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
        <p className="mt-1 text-sm text-muted-foreground">
          Status: {asset?.status ?? "…"} · {asset?.mimeType}
        </p>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {previewUrl && asset?.mimeType.startsWith("image/") ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt={asset.altText || asset.originalFilename}
          className="max-h-80 rounded-md border border-border object-contain"
        />
      ) : null}
      <div className="flex flex-wrap gap-3 text-sm">
        <Link
          href={`/guardian/assets/${params.id}/edit`}
          className="underline-offset-4 hover:underline"
        >
          Edit metadata
        </Link>
        <Link
          href={`/guardian/assets/${params.id}/history`}
          className="underline-offset-4 hover:underline"
        >
          History
        </Link>
        <Link
          href={`/guardian/assets/${params.id}/activity`}
          className="underline-offset-4 hover:underline"
        >
          Activity
        </Link>
      </div>
    </main>
  );
}
