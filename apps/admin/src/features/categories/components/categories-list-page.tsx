"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  deleteCategory,
  listAdminCategories,
  publishCategory,
} from "@/features/categories/api/categories-api";
import type { Category } from "@/features/categories/types";
import { ClearableSearchInput } from "@/features/products/components/clearable-search-input";
import { ListPaginationBar } from "@/features/products/components/list-pagination-bar";

const PAGE_SIZE = 25;

function parsePage(value: string | null): number {
  const n = Number(value ?? "1");
  if (!Number.isFinite(n) || n < 1) return 0;
  return Math.floor(n) - 1;
}

export function CategoriesListPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const appliedQ = searchParams.get("q") ?? "";
  const page = parsePage(searchParams.get("page"));

  const [draftQ, setDraftQ] = useState(appliedQ);
  const [syncedQ, setSyncedQ] = useState(appliedQ);
  const [items, setItems] = useState<Category[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Sync draft search when URL applied filters change (back/forward/clear).
  if (appliedQ !== syncedQ) {
    setSyncedQ(appliedQ);
    setDraftQ(appliedQ);
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const appliedFiltersActive = Boolean(appliedQ);

  const writeParams = useCallback(
    (patch: Record<string, string | null | undefined>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value == null || value === "") next.delete(key);
        else next.set(key, value);
      }
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams],
  );

  const refreshList = useCallback(async () => {
    const result = await listAdminCategories({
      q: appliedQ || undefined,
      skip: 0,
      take: 200,
    });
    const start = page * PAGE_SIZE;
    setTotal(result.items.length);
    setItems(result.items.slice(start, start + PAGE_SIZE));
    setSelected(new Set());
    setError(null);
    setLoading(false);
  }, [appliedQ, page]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        // Load matching set (hierarchy-aware), then paginate client-side so
        // parent/child indentation stays intact across pages.
        const result = await listAdminCategories({
          q: appliedQ || undefined,
          skip: 0,
          take: 200,
        });
        if (cancelled) return;
        const start = page * PAGE_SIZE;
        setTotal(result.items.length);
        setItems(result.items.slice(start, start + PAGE_SIZE));
        setSelected(new Set());
        setError(null);
      } catch {
        if (cancelled) return;
        setError("Unable to load categories.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [appliedQ, page]);

  function applySearch() {
    writeParams({ q: draftQ.trim() || null, page: "1" });
  }

  function clearFilters() {
    setDraftQ("");
    writeParams({ q: null, page: null });
  }

  async function applyBulk() {
    if (bulkAction !== "delete" || selected.size === 0) return;
    try {
      await Promise.all(
        [...selected].map((id) => deleteCategory(id).catch(() => null)),
      );
      setBulkAction("");
      await refreshList();
    } catch {
      setError("Bulk delete failed. Unlink products / children first.");
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Catalog taxonomy for Store navigation. Sibling to Products.
          </p>
        </div>
        <Button render={<Link href="/guardian/categories/new" />}>
          Add category
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-8 rounded-md border border-border bg-background px-2 text-sm"
          value={bulkAction}
          onChange={(e) => setBulkAction(e.target.value)}
        >
          <option value="">Bulk actions</option>
          <option value="delete">Delete</option>
        </select>
        <Button
          size="sm"
          variant="outline"
          disabled={!bulkAction || selected.size === 0}
          onClick={() => void applyBulk()}
        >
          Apply
        </Button>

        <form
          className="ml-auto flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            applySearch();
          }}
        >
          <ClearableSearchInput
            value={draftQ}
            onChange={setDraftQ}
            onClear={() => {
              setDraftQ("");
              if (appliedQ) writeParams({ q: null, page: "1" });
            }}
            placeholder="Search categories"
            className="w-52"
            aria-label="Search categories"
          />
          <Button type="submit" size="sm" variant="outline">
            Search categories
          </Button>
          {appliedFiltersActive ? (
            <Button type="button" size="sm" variant="ghost" onClick={clearFilters}>
              Clear
            </Button>
          ) : null}
        </form>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-250 text-left text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={
                      items.length > 0 && items.every((c) => selected.has(c.id))
                    }
                    onChange={() => {
                      if (items.every((c) => selected.has(c.id))) {
                        setSelected(new Set());
                      } else {
                        setSelected(new Set(items.map((c) => c.id)));
                      }
                    }}
                    aria-label="Select all"
                  />
                </th>
                <th className="w-12 px-2 py-2" aria-label="Image" />
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">ID</th>
                <th className="px-3 py-2 font-medium">Description</th>
                <th className="px-3 py-2 font-medium">Slug</th>
                <th className="px-3 py-2 font-medium">Count</th>
                <th className="px-3 py-2 font-medium">Min</th>
                <th className="px-3 py-2 font-medium">Max</th>
                <th className="px-3 py-2 font-medium">Group of</th>
                <th className="w-10 px-3 py-2" aria-label="Reorder" />
              </tr>
            </thead>
            <tbody>
              {items.map((category) => {
                const depth = category.depth ?? 0;
                const editHref = `/guardian/categories/${category.id}/edit`;
                return (
                  <tr
                    key={category.id}
                    className="group border-t border-border hover:bg-muted/20"
                    onMouseEnter={() => setHoveredId(category.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(category.id)}
                        onChange={() =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(category.id)) next.delete(category.id);
                            else next.add(category.id);
                            return next;
                          })
                        }
                        aria-label={`Select ${category.name}`}
                      />
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded border border-border bg-muted/30 text-[10px] text-muted-foreground">
                        {category.thumbnailMediaAssetId ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={category.thumbnailMediaAssetId}
                            alt=""
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display =
                                "none";
                            }}
                          />
                        ) : (
                          "—"
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <Link
                        href={editHref}
                        className="font-medium text-primary hover:underline"
                        style={{ paddingLeft: depth * 16 }}
                      >
                        {depth > 0 ? "— " : ""}
                        {category.name}
                      </Link>
                      <div
                        className={`mt-1 flex flex-wrap gap-x-1 text-xs text-primary transition-opacity ${
                          hoveredId === category.id
                            ? "opacity-100"
                            : "opacity-0 group-hover:opacity-100"
                        }`}
                        style={{ paddingLeft: depth * 16 }}
                      >
                        <Link href={editHref} className="hover:underline">
                          Edit
                        </Link>
                        <span className="text-muted-foreground">|</span>
                        <button
                          type="button"
                          className="text-destructive hover:underline"
                          onClick={() =>
                            void deleteCategory(category.id)
                              .then(() => refreshList())
                              .catch(() =>
                                setError(
                                  "Delete failed. Unlink products and children first.",
                                ),
                              )
                          }
                        >
                          Delete
                        </button>
                        <span className="text-muted-foreground">|</span>
                        {category.lifecycleStatus !== "PUBLISHED" ? (
                          <button
                            type="button"
                            className="hover:underline"
                            onClick={() =>
                              void publishCategory(category.id).then(() =>
                                refreshList(),
                              )
                            }
                          >
                            Publish
                          </button>
                        ) : (
                          <span className="text-muted-foreground">
                            Published
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="max-w-55 px-3 py-3">
                      <code
                        className="block truncate text-xs text-muted-foreground"
                        title={category.id}
                      >
                        {category.id}
                      </code>
                    </td>
                    <td className="max-w-45 truncate px-3 py-3 text-muted-foreground">
                      {category.description || "—"}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {category.slug}
                    </td>
                    <td className="px-3 py-3">
                      {category._count?.productLinks ?? 0}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {category.minQuantity ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {category.maxQuantity ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {category.groupOf ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">☰</td>
                  </tr>
                );
              })}
              {!items.length ? (
                <tr>
                  <td
                    colSpan={11}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    No categories found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      <ListPaginationBar
        total={total}
        page={page}
        pageCount={pageCount}
        onPrev={() =>
          writeParams({ page: page <= 0 ? null : String(page) })
        }
        onNext={() =>
          writeParams({ page: String(Math.min(pageCount, page + 2)) })
        }
      />
    </main>
  );
}
