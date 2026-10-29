"use client";

import { Inbox } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  AppSelect,
  ClearableSearchInput,
  ClickableTableRow,
  ClinexaPage,
  CollapsibleFilterFields,
  DEFAULT_LIST_PAGE_SIZE,
  DataTable,
  EmptyState,
  ErrorState,
  FilterFieldsToggle,
  FilterPanel,
  LIST_PAGE_SIZE_OPTIONS,
  ListPaginationBar,
  PageBody,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  filterApplyButtonClassName,
} from "@/components/patterns";
import { Button } from "@/components/ui/button";
import {
  deleteCategory,
  listAdminCategories,
  publishCategory,
} from "@/features/categories/api/categories-api";
import type { Category } from "@/features/categories/types";
import { cn } from "@/lib/utils";

const PAGE_SIZE_SET = new Set<number>(LIST_PAGE_SIZE_OPTIONS);

function parsePage(value: string | null): number {
  const n = Number(value ?? "1");
  if (!Number.isFinite(n) || n < 1) return 0;
  return Math.floor(n) - 1;
}

function parsePageSize(value: string | null): number {
  const n = Number(value ?? DEFAULT_LIST_PAGE_SIZE);
  if (PAGE_SIZE_SET.has(n)) return n;
  return DEFAULT_LIST_PAGE_SIZE;
}

export function CategoriesListPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const appliedQ = searchParams.get("q") ?? "";
  const page = parsePage(searchParams.get("page"));
  const pageSize = parsePageSize(searchParams.get("take"));

  const [draftQ, setDraftQ] = useState(appliedQ);
  const [syncedQ, setSyncedQ] = useState(appliedQ);
  const [items, setItems] = useState<Category[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  if (appliedQ !== syncedQ) {
    setSyncedQ(appliedQ);
    setDraftQ(appliedQ);
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

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
    const start = page * pageSize;
    setTotal(result.items.length);
    setItems(result.items.slice(start, start + pageSize));
    setSelected(new Set());
    setError(null);
    setLoading(false);
  }, [appliedQ, page, pageSize]);

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
        const start = page * pageSize;
        setTotal(result.items.length);
        setItems(result.items.slice(start, start + pageSize));
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
  }, [appliedQ, page, pageSize]);

  function applySearch() {
    writeParams({ q: draftQ.trim() || null, page: "1" });
  }

  async function applyBulk(action: string) {
    if (action !== "delete" || selected.size === 0) {
      setBulkAction("");
      return;
    }
    try {
      await Promise.all(
        [...selected].map((id) => deleteCategory(id).catch(() => null)),
      );
      setBulkAction("");
      await refreshList();
    } catch {
      setError("Bulk delete failed. Unlink products / children first.");
      setBulkAction("");
    }
  }

  return (
    <ClinexaPage width="wide" className="gap-6">
      <PageBody>
        <FilterPanel>
          <div className="grid grid-cols-1 items-center gap-2 md:grid-cols-[minmax(0,1fr)_minmax(12rem,min(100%,28rem))_minmax(0,1fr)]">
            <div className="order-2 flex justify-start md:order-1">
              <FilterFieldsToggle
                open={filtersOpen}
                onOpenChange={setFiltersOpen}
              />
            </div>
            <form
              className="order-1 w-full min-w-0 md:order-2"
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
                className="w-full"
                aria-label="Search categories"
              />
              <button type="submit" className="sr-only">
                Apply
              </button>
            </form>
            <div className="order-3 flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                size="sm"
                className={filterApplyButtonClassName}
                onClick={() => applySearch()}
              >
                Apply
              </Button>
              <Button render={<Link href="/guardian/categories/new" />}>
                Add category
              </Button>
            </div>
          </div>

          <CollapsibleFilterFields open={filtersOpen}>
            <div className="flex flex-wrap items-center gap-2">
              <AppSelect
                size="default"
                value={bulkAction}
                onValueChange={(next) => {
                  setBulkAction(next);
                  if (next) void applyBulk(next);
                }}
                aria-label="Bulk actions"
                className="w-44 max-w-full"
                options={[
                  { value: "", label: "Bulk actions" },
                  { value: "delete", label: "Delete" },
                ]}
              />
            </div>
          </CollapsibleFilterFields>
        </FilterPanel>

        <DataTable
          framed
          stickyFirstColumn
          loading={loading}
          empty={!loading && !error && items.length === 0}
          emptyState={
            <EmptyState
              icon={<Inbox />}
              title="No categories found"
              description="Try a different search."
            />
          }
          error={
            error ? (
              <ErrorState title="Unable to load categories">{error}</ErrorState>
            ) : undefined
          }
          footer={
            <ListPaginationBar
              total={total}
              page={page}
              pageCount={pageCount}
              pageSize={pageSize}
              onPageSizeChange={(next) =>
                writeParams({
                  take:
                    next === DEFAULT_LIST_PAGE_SIZE ? null : String(next),
                  page: "1",
                })
              }
              onPrev={() =>
                writeParams({ page: page <= 0 ? null : String(page) })
              }
              onNext={() =>
                writeParams({ page: String(Math.min(pageCount, page + 2)) })
              }
            />
          }
        >
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
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
              </TableHead>
              <TableHead className="w-12" aria-label="Image" />
              <TableHead>Name</TableHead>
              <TableHead>ID</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Count</TableHead>
              <TableHead>Min</TableHead>
              <TableHead>Max</TableHead>
              <TableHead>Group of</TableHead>
              <TableHead className="w-10" aria-label="Reorder" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((category) => {
              const depth = category.depth ?? 0;
              const editHref = `/guardian/categories/${category.id}/edit`;
              return (
                <ClickableTableRow
                  href={editHref}
                  key={category.id}
                  className="group"
                  onMouseEnter={() => setHoveredId(category.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <TableCell>
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
                  </TableCell>
                  <TableCell>
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
                  </TableCell>
                  <TableCell>
                    <Link
                      href={editHref}
                      className="font-medium text-primary hover:underline"
                      style={{ paddingLeft: depth * 16 }}
                    >
                      {depth > 0 ? "— " : ""}
                      {category.name}
                    </Link>
                    <div
                      className={cn(
                        "mt-1 flex flex-wrap gap-x-1 text-xs text-primary transition-opacity",
                        hoveredId === category.id
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-100",
                      )}
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
                  </TableCell>
                  <TableCell className="max-w-55">
                    <code
                      className="block truncate text-xs text-muted-foreground"
                      title={category.id}
                    >
                      {category.id}
                    </code>
                  </TableCell>
                  <TableCell className="max-w-45 truncate text-muted-foreground">
                    {category.description || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {category.slug}
                  </TableCell>
                  <TableCell>
                    {category._count?.productLinks ?? 0}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {category.minQuantity ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {category.maxQuantity ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {category.groupOf ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">☰</TableCell>
                </ClickableTableRow>
              );
            })}
          </TableBody>
        </DataTable>
      </PageBody>
    </ClinexaPage>
  );
}
