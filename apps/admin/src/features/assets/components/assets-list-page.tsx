"use client";

import { Inbox, Search, Upload } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  ClearableSearchInput,
  EmptyState,
  ErrorState,
  LIST_PAGE_SIZE_OPTIONS,
  ListPaginationBar,
} from "@/components/patterns";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  archiveAsset,
  bulkAssets,
  deleteAsset,
  listAdminAssets,
  restoreAsset,
} from "@/features/assets/api/assets-api";
import {
  AssetLibraryHeader,
  AssetLibraryShell,
} from "@/features/assets/components/asset-library-shell";
import { AssetThumb } from "@/features/assets/components/asset-thumb";
import { formatAssetBytes } from "@/features/assets/lib/mime-from-filename";
import type { Asset, AssetStatus } from "@/features/assets/types";
import { usePermissions } from "@/features/auth/hooks/use-permissions";
import { Permissions } from "@/features/auth/permissions";
import { cn } from "@/lib/utils";

const STATUS_CHIPS: Array<{ key: AssetStatus | "ALL"; label: string }> = [
  { key: "ALL", label: "All" },
  { key: "ACTIVE", label: "Active" },
  { key: "ARCHIVED", label: "Archived" },
  { key: "DELETED", label: "Deleted" },
];

const STATUS_KEYS = new Set(STATUS_CHIPS.map((t) => t.key));
const PAGE_SIZE_SET = new Set<number>(LIST_PAGE_SIZE_OPTIONS);
/** Gallery default — denser grid; 10 left the 11th item alone on page 2. */
const ASSETS_DEFAULT_PAGE_SIZE = 50;

function parseStatus(value: string | null): AssetStatus | "ALL" {
  if (value && STATUS_KEYS.has(value as AssetStatus | "ALL")) {
    return value as AssetStatus | "ALL";
  }
  return "ACTIVE";
}

function parsePage(value: string | null): number {
  const n = Number(value ?? "1");
  if (!Number.isFinite(n) || n < 1) return 0;
  return Math.floor(n) - 1;
}

function parsePageSize(value: string | null): number {
  const n = Number(value ?? ASSETS_DEFAULT_PAGE_SIZE);
  if (PAGE_SIZE_SET.has(n)) return n;
  return ASSETS_DEFAULT_PAGE_SIZE;
}

function allCount(statusCounts: Record<string, number>) {
  return Object.entries(statusCounts).reduce((sum, [key, n]) => {
    if (key === "DELETED") return sum;
    return sum + n;
  }, 0);
}

export function AssetsListPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { can } = usePermissions();
  const canManage = can(Permissions.AST_MANAGE);
  const canDestroy = can(Permissions.AST_DESTRUCTIVE);
  const canBulk = can(Permissions.AST_BULK_DESTRUCTIVE);

  const appliedQ = searchParams.get("q") ?? "";
  const statusParam = parseStatus(searchParams.get("status"));
  const page = parsePage(searchParams.get("page"));
  const pageSize = parsePageSize(searchParams.get("take"));

  const [draftQ, setDraftQ] = useState(appliedQ);
  const [syncedQ, setSyncedQ] = useState(appliedQ);
  const [items, setItems] = useState<Asset[]>([]);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  if (appliedQ !== syncedQ) {
    setSyncedQ(appliedQ);
    setDraftQ(appliedQ);
  }

  function writeParams(patch: Record<string, string | null | undefined>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value == null || value === "") next.delete(key);
      else next.set(key, value);
    }
    if (patch.status === "ALL") next.set("status", "ALL");
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAdminAssets({
        q: appliedQ || undefined,
        status: statusParam === "ALL" ? undefined : statusParam,
        skip: page * pageSize,
        take: pageSize,
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
  }, [appliedQ, statusParam, page, pageSize]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const res = await listAdminAssets({
          q: appliedQ || undefined,
          status: statusParam === "ALL" ? undefined : statusParam,
          skip: page * pageSize,
          take: pageSize,
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
  }, [appliedQ, statusParam, page, pageSize]);

  function applySearch() {
    writeParams({ q: draftQ.trim() || null, page: "1" });
  }

  async function onArchive(id: string) {
    if (!window.confirm("Archive this asset?")) return;
    try {
      await archiveAsset(id);
      toast.success("Asset archived.");
      await reload();
    } catch {
      toast.error("Unable to archive asset.");
    }
  }

  async function onRestore(id: string) {
    if (!window.confirm("Restore this asset?")) return;
    try {
      await restoreAsset(id);
      toast.success("Asset restored.");
      await reload();
    } catch {
      toast.error("Unable to restore asset.");
    }
  }

  async function onDelete(id: string) {
    if (!window.confirm("Soft-delete this asset?")) return;
    try {
      await deleteAsset(id);
      toast.success("Asset deleted.");
      await reload();
    } catch {
      toast.error("Unable to delete asset.");
    }
  }

  async function onBulk(action: "archive" | "delete") {
    if (!selected.size) return;
    if (!window.confirm(`Bulk ${action} ${selected.size} asset(s)?`)) return;
    try {
      await bulkAssets([...selected], action);
      toast.success(`Bulk ${action} complete.`);
      setSelected(new Set());
      await reload();
    } catch {
      toast.error(`Unable to bulk ${action}.`);
    }
  }

  return (
    <AssetLibraryShell>
      <AssetLibraryHeader eyebrow="Media Vault" className="mb-5 sm:mb-6" />

      <div className="mb-6 flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-2">
        <div
          className="flex shrink-0 gap-2 overflow-x-auto pb-0.5"
          role="tablist"
          aria-label="Asset status"
        >
          {STATUS_CHIPS.map((chip) => {
            const count =
              chip.key === "ALL"
                ? allCount(statusCounts)
                : (statusCounts[chip.key] ?? 0);
            const active = statusParam === chip.key;
            return (
              <button
                key={chip.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() =>
                  writeParams({
                    status: chip.key,
                    page: "1",
                  })
                }
                className={cn(
                  "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "border-info/40 bg-info text-info-foreground shadow-sm"
                    : "border-border/70 bg-card/70 text-muted-foreground hover:border-info/30 hover:text-foreground",
                )}
              >
                {chip.label}
                <span
                  className={cn(
                    "ml-1.5 tabular-nums",
                    active ? "opacity-90" : "opacity-60",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <form
          className="flex min-w-0 w-full max-w-md flex-1 items-center gap-2 sm:w-auto"
          onSubmit={(event) => {
            event.preventDefault();
            applySearch();
          }}
        >
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <ClearableSearchInput
              value={draftQ}
              onChange={setDraftQ}
              onClear={() => {
                setDraftQ("");
                if (appliedQ) writeParams({ q: null, page: "1" });
              }}
              placeholder="Search filename, alt, caption…"
              className="w-full"
              inputClassName="pl-9"
              aria-label="Search assets"
            />
          </div>
          <Button
            type="submit"
            size="sm"
            className="shrink-0 border-transparent bg-success text-success-foreground hover:bg-success/90"
          >
            Apply
          </Button>
        </form>

        {canManage ? (
          <Button
            size="sm"
            className="shrink-0 border-transparent bg-info text-info-foreground hover:bg-info/90 sm:ml-auto"
            render={<Link href="/guardian/assets/upload" />}
          >
            <Upload className="size-4" />
            Upload
          </Button>
        ) : null}
      </div>

      {error ? (
        <ErrorState title="Unable to load assets">{error}</ErrorState>
      ) : loading ? (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="aspect-4/3 animate-pulse rounded-xl bg-muted/50"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Inbox />}
          title="No assets found"
          description="Try a different search or status filter, or upload something new."
        />
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {items.map((asset) => {
            const selectedOn = selected.has(asset.id);
            return (
              <article
                key={asset.id}
                className={cn(
                  "group relative flex flex-col overflow-hidden rounded-xl border bg-card/75 shadow-sm backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md",
                  selectedOn
                    ? "border-info ring-2 ring-info/30"
                    : "border-border/70",
                )}
              >
                <div className="relative aspect-4/3 overflow-hidden bg-muted/30">
                  <Link
                    href={`/guardian/assets/${asset.id}`}
                    className="absolute inset-0 block size-full"
                  >
                    <AssetThumb
                      assetId={asset.id}
                      mimeType={asset.mimeType}
                      alt={asset.altText || asset.originalFilename}
                      status={asset.status}
                      className="transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                  </Link>
                  <div className="pointer-events-none absolute top-1.5 left-1.5 scale-90 origin-top-left">
                    <StatusBadge status={asset.status} />
                  </div>
                  {canBulk ? (
                    <label className="absolute top-1.5 right-1.5 z-10 flex size-6 cursor-pointer items-center justify-center rounded-md bg-black/45 text-white backdrop-blur-sm">
                      <input
                        type="checkbox"
                        className="size-3 accent-[oklch(0.55_0.12_250)]"
                        checked={selectedOn}
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
                    </label>
                  ) : null}
                </div>

                <div className="flex flex-1 flex-col gap-1.5 p-2.5">
                  <div className="min-w-0">
                    <Link
                      href={`/guardian/assets/${asset.id}`}
                      className="block truncate text-xs font-semibold hover:text-info sm:text-sm"
                    >
                      {asset.originalFilename}
                    </Link>
                    <p className="mt-0.5 truncate text-[0.65rem] text-muted-foreground sm:text-xs">
                      {asset.mimeType} · {formatAssetBytes(asset.byteSize)}
                    </p>
                  </div>
                  <div className="mt-auto flex flex-wrap gap-x-2 gap-y-0.5 text-[0.65rem] sm:text-xs">
                    {canManage ? (
                      <Link
                        href={`/guardian/assets/${asset.id}/edit`}
                        className="font-medium text-info hover:underline"
                      >
                        Edit
                      </Link>
                    ) : null}
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
                    (asset.status === "ARCHIVED" ||
                      asset.status === "DELETED") ? (
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
                </div>
              </article>
            );
          })}
        </div>
      )}

      {!error && !loading && items.length > 0 ? (
        <div className="mt-6">
          <ListPaginationBar
            total={total}
            page={page}
            pageCount={pageCount}
            pageSize={pageSize}
            onPageSizeChange={(next) =>
              writeParams({
                take:
                  next === ASSETS_DEFAULT_PAGE_SIZE ? null : String(next),
                page: "1",
              })
            }
            onPrev={() =>
              writeParams({ page: page <= 0 ? null : String(page) })
            }
            onNext={() =>
              writeParams({
                page: String(Math.min(pageCount, page + 2)),
              })
            }
          />
        </div>
      ) : null}

      {canBulk && selected.size > 0 ? (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 pointer-events-none">
          <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-full border border-border/80 bg-card/95 px-4 py-2.5 shadow-lg backdrop-blur-md">
            <span className="text-sm font-medium tabular-nums">
              {selected.size} selected
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void onBulk("archive")}
            >
              Archive
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => void onBulk("delete")}
            >
              Delete
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </Button>
          </div>
        </div>
      ) : null}
    </AssetLibraryShell>
  );
}
