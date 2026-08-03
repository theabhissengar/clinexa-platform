"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  archiveAsset,
  bulkAssets,
  deleteAsset,
  listAdminAssets,
  restoreAsset,
} from "@/features/assets/api/assets-api";
import type { Asset, AssetStatus } from "@/features/assets/types";
import { usePermissions } from "@/features/auth/hooks/use-permissions";
import { Permissions } from "@/features/auth/permissions";

const STATUS_TABS: Array<{ key: AssetStatus | "ALL"; label: string }> = [
  { key: "ALL", label: "All" },
  { key: "ACTIVE", label: "Active" },
  { key: "ARCHIVED", label: "Archived" },
  { key: "UPLOADED", label: "Uploaded" },
  { key: "DELETED", label: "Deleted" },
];

const PAGE_SIZE = 24;

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function AssetsListPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { can } = usePermissions();
  const canManage = can(Permissions.AST_MANAGE);
  const canDestroy = can(Permissions.AST_DESTRUCTIVE);
  const canBulk = can(Permissions.AST_BULK_DESTRUCTIVE);

  const [draftQ, setDraftQ] = useState(searchParams.get("q") ?? "");
  const [items, setItems] = useState<Asset[]>([]);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const statusParam = (searchParams.get("status") ?? "ACTIVE") as
    | AssetStatus
    | "ALL";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);

  const applyParams = useCallback(
    (next: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(next)) {
        if (!v || v === "ALL") params.delete(k);
        else params.set(k, v);
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams],
  );

  const loadKey = `${searchParams.toString()}|${statusParam}|${page}`;

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const res = await listAdminAssets({
          q: searchParams.get("q") ?? undefined,
          status: statusParam === "ALL" ? undefined : statusParam,
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
        });
        if (cancelled) return;
        setItems(res.items);
        setTotal(res.total);
        setStatusCounts(res.statusCounts);
        setError(null);
      } catch {
        if (cancelled) return;
        setError("Unable to load assets.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
    // searchParams identity is keyed via loadKey
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadKey captures query state
  }, [loadKey, page, statusParam]);

  async function reload() {
    setLoading(true);
    try {
      const res = await listAdminAssets({
        q: searchParams.get("q") ?? undefined,
        status: statusParam === "ALL" ? undefined : statusParam,
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      });
      setItems(res.items);
      setTotal(res.total);
      setStatusCounts(res.statusCounts);
      setError(null);
    } catch {
      setError("Unable to load assets.");
    } finally {
      setLoading(false);
    }
  }

  async function onArchive(id: string) {
    if (!window.confirm("Archive this asset? (Class D)")) return;
    await archiveAsset(id);
    await reload();
  }

  async function onRestore(id: string) {
    if (!window.confirm("Restore this asset? (Class D)")) return;
    await restoreAsset(id);
    await reload();
  }

  async function onDelete(id: string) {
    if (!window.confirm("Soft-delete this asset? (Class D)")) return;
    await deleteAsset(id);
    await reload();
  }

  async function onBulk(action: "archive" | "delete") {
    if (!selected.size) return;
    if (
      !window.confirm(
        `Bulk ${action} ${selected.size} asset(s)? (Class D)`,
      )
    ) {
      return;
    }
    await bulkAssets([...selected], action);
    setSelected(new Set());
    await reload();
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Asset Library
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Reusable business assets. Consumers store Asset IDs only — never
            provider URLs.
          </p>
        </div>
        {canManage ? (
          <Button render={<Link href="/guardian/assets/upload" />}>
            Upload
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => {
          const count =
            tab.key === "ALL"
              ? Object.values(statusCounts).reduce((a, b) => a + b, 0)
              : (statusCounts[tab.key] ?? 0);
          const active =
            (tab.key === "ALL" && statusParam === "ALL") ||
            tab.key === statusParam;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() =>
                applyParams({
                  status: tab.key === "ALL" ? "ALL" : tab.key,
                  page: "1",
                })
              }
              className={`rounded-md border px-3 py-1.5 text-sm ${
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {tab.label} ({count})
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1">
          <label className="mb-1 block text-xs text-muted-foreground">
            Search
          </label>
          <Input
            value={draftQ}
            onChange={(e) => setDraftQ(e.target.value)}
            placeholder="Filename, alt, caption…"
          />
        </div>
        <Button
          type="button"
          onClick={() =>
            applyParams({ q: draftQ.trim() || undefined, page: "1" })
          }
        >
          Search
        </Button>
        {(searchParams.get("q") || statusParam !== "ACTIVE") && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setDraftQ("");
              router.push(pathname);
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {canBulk && selected.size > 0 ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => void onBulk("archive")}>
            Bulk archive ({selected.size})
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void onBulk("delete")}
          >
            Bulk delete ({selected.size})
          </Button>
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading assets…</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((asset) => (
            <article
              key={asset.id}
              className="rounded-lg border border-border p-3"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    href={`/guardian/assets/${asset.id}`}
                    className="block truncate text-sm font-medium hover:underline"
                  >
                    {asset.originalFilename}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {asset.mimeType} · {formatBytes(asset.byteSize)} ·{" "}
                    {asset.status}
                  </p>
                </div>
                {canBulk ? (
                  <input
                    type="checkbox"
                    checked={selected.has(asset.id)}
                    onChange={(e) => {
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(asset.id);
                        else next.delete(asset.id);
                        return next;
                      });
                    }}
                    aria-label={`Select ${asset.originalFilename}`}
                  />
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <Link
                  href={`/guardian/assets/${asset.id}/edit`}
                  className="text-muted-foreground hover:underline"
                >
                  Edit
                </Link>
                <Link
                  href={`/guardian/assets/${asset.id}/history`}
                  className="text-muted-foreground hover:underline"
                >
                  History
                </Link>
                {canDestroy && asset.status === "ACTIVE" ? (
                  <button
                    type="button"
                    className="text-destructive hover:underline"
                    onClick={() => void onArchive(asset.id)}
                  >
                    Archive
                  </button>
                ) : null}
                {canDestroy &&
                (asset.status === "ARCHIVED" || asset.status === "DELETED") ? (
                  <button
                    type="button"
                    className="hover:underline"
                    onClick={() => void onRestore(asset.id)}
                  >
                    Restore
                  </button>
                ) : null}
                {canDestroy && asset.status !== "DELETED" ? (
                  <button
                    type="button"
                    className="text-destructive hover:underline"
                    onClick={() => void onDelete(asset.id)}
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            </article>
          ))}
          {!items.length ? (
            <p className="text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">
              No assets found.
            </p>
          ) : null}
        </div>
      )}

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {total} item{total === 1 ? "" : "s"}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => applyParams({ page: String(page - 1) })}
          >
            ‹
          </Button>
          <span>Page {page}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page * PAGE_SIZE >= total}
            onClick={() => applyParams({ page: String(page + 1) })}
          >
            ›
          </Button>
        </div>
      </div>
    </main>
  );
}
