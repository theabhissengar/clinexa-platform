"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { getAssetActivity } from "@/features/assets/api/assets-api";
import type { AssetActivityRow } from "@/features/assets/types";

export function AssetActivityPage() {
  const params = useParams<{ id: string }>();
  const [rows, setRows] = useState<AssetActivityRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getAssetActivity(params.id)
      .then(setRows)
      .catch(() => setError("Unable to load activity."));
  }, [params.id]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <Link
          href={`/guardian/assets/${params.id}`}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Back to asset
        </Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Interactions on this asset (upload, edit, resolve). Not History diffs.
        </p>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <ul className="space-y-2 text-sm">
        {rows.map((row) => (
          <li key={row.id} className="rounded-md border border-border px-3 py-2">
            <div className="font-medium">{row.summary}</div>
            <div className="text-xs text-muted-foreground">
              {row.kind} · {new Date(row.createdAt).toLocaleString()}
            </div>
          </li>
        ))}
        {!rows.length && !error ? (
          <li className="text-muted-foreground">No activity yet.</li>
        ) : null}
      </ul>
    </main>
  );
}
