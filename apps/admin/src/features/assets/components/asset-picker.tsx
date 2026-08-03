"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listPickerAssets } from "@/features/assets/api/assets-api";
import type { Asset } from "@/features/assets/types";

type Props = {
  /** Called with opaque Asset ID only — never a provider URL. */
  onSelect: (assetId: string, asset: Asset) => void;
  onClose?: () => void;
};

/**
 * CRM/Guardian picker foundation: Active assets only; no upload affordance.
 */
export function AssetPicker({ onSelect, onClose }: Props) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Asset[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listPickerAssets({ take: 30 })
      .then((res) => setItems(res.items))
      .catch(() => setError("Unable to load assets."));
  }, []);

  async function search() {
    setError(null);
    try {
      const res = await listPickerAssets({ q: q.trim() || undefined, take: 30 });
      setItems(res.items);
    } catch {
      setError("Unable to search assets.");
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Select asset</h2>
        {onClose ? (
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Active reusable assets only. Upload and organize remain Guardian
        responsibilities.
      </p>
      <div className="flex gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search Active assets…"
        />
        <Button type="button" onClick={() => void search()}>
          Search
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <ul className="max-h-64 space-y-1 overflow-auto text-sm">
        {items.map((asset) => (
          <li key={asset.id}>
            <button
              type="button"
              className="w-full rounded-md px-2 py-1.5 text-left hover:bg-muted"
              onClick={() => onSelect(asset.id, asset)}
            >
              <span className="font-medium">{asset.originalFilename}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {asset.mimeType}
              </span>
            </button>
          </li>
        ))}
        {!items.length ? (
          <li className="text-muted-foreground">No Active assets.</li>
        ) : null}
      </ul>
    </div>
  );
}
