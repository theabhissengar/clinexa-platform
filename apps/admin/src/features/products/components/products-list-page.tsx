"use client";

import { Inbox } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  FilterControl,
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
  filterControlCompactClassName,
  filterFieldsRowClassName,
} from "@/components/patterns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listAdminCategories } from "@/features/categories/api/categories-api";
import {
  duplicateProduct,
  listAdminProducts,
  toggleProductFeatured,
  transitionProduct,
} from "@/features/products/api/products-api";
import type {
  Category,
  Product,
  ProductLifecycleStatus,
  ProductStatusCounts,
  ProductType,
} from "@/features/products/types";
import { cn } from "@/lib/utils";

function formatPrice(product: Product): string {
  if (!product.variants.length) return "—";
  const prices = product.variants.map((v) => v.salePriceCents ?? v.priceCents);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  if (min === max) {
    const v = product.variants[0];
    if (v.salePriceCents != null && v.salePriceCents < v.priceCents) {
      return `${fmt(v.priceCents)} ${fmt(v.salePriceCents)}`;
    }
    return fmt(min);
  }
  return `From: ${fmt(min)}`;
}

function formatDate(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

const STATUS_TABS: Array<{
  key: ProductLifecycleStatus | "ALL";
  label: string;
}> = [
  { key: "ALL", label: "All" },
  { key: "PUBLISHED", label: "Published" },
  { key: "DRAFT", label: "Draft" },
  { key: "REVIEW", label: "Review" },
  { key: "UNPUBLISHED", label: "Private" },
  { key: "ARCHIVED", label: "Trash" },
];

const PRODUCT_TYPES: ProductType[] = [
  "STANDARD",
  "VARIABLE",
  "SIMPLE_SUBSCRIPTION",
  "VARIABLE_SUBSCRIPTION",
  "BUNDLE",
  "KIT",
  "DIGITAL",
];

const STATUS_KEYS = new Set(STATUS_TABS.map((t) => t.key));
const PAGE_SIZE_SET = new Set<number>(LIST_PAGE_SIZE_OPTIONS);

function parseStatus(value: string | null): ProductLifecycleStatus | "ALL" {
  if (value && STATUS_KEYS.has(value as ProductLifecycleStatus | "ALL")) {
    return value as ProductLifecycleStatus | "ALL";
  }
  return "ALL";
}

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

export function ProductsListPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const appliedStatus = parseStatus(searchParams.get("status"));
  const appliedQ = searchParams.get("q") ?? "";
  const appliedCategoryId = searchParams.get("categoryId") ?? "";
  const appliedProductType = searchParams.get("productType") ?? "";
  const appliedBrandName = searchParams.get("brand") ?? "";
  const page = parsePage(searchParams.get("page"));
  const pageSize = parsePageSize(searchParams.get("take"));

  const [draftQ, setDraftQ] = useState(appliedQ);
  const [draftCategoryId, setDraftCategoryId] = useState(appliedCategoryId);
  const [draftProductType, setDraftProductType] = useState(appliedProductType);
  const [draftBrandName, setDraftBrandName] = useState(appliedBrandName);
  const [syncedFilters, setSyncedFilters] = useState({
    q: appliedQ,
    categoryId: appliedCategoryId,
    productType: appliedProductType,
    brand: appliedBrandName,
  });

  const [items, setItems] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<ProductStatusCounts | null>(
    null,
  );
  const [categories, setCategories] = useState<Category[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const appliedFiltersActive = Boolean(
    appliedQ || appliedCategoryId || appliedProductType || appliedBrandName,
  );

  if (
    appliedQ !== syncedFilters.q ||
    appliedCategoryId !== syncedFilters.categoryId ||
    appliedProductType !== syncedFilters.productType ||
    appliedBrandName !== syncedFilters.brand
  ) {
    setSyncedFilters({
      q: appliedQ,
      categoryId: appliedCategoryId,
      productType: appliedProductType,
      brand: appliedBrandName,
    });
    setDraftQ(appliedQ);
    setDraftCategoryId(appliedCategoryId);
    setDraftProductType(appliedProductType);
    setDraftBrandName(appliedBrandName);
  }

  const writeParams = useCallback(
    (patch: Record<string, string | null | undefined>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value == null || value === "" || value === "ALL") next.delete(key);
        else next.set(key, value);
      }
      const qs = next.toString();
      const href = qs ? `${pathname}?${qs}` : pathname;
      router.push(href);
    },
    [pathname, router, searchParams],
  );

  const refreshList = useCallback(async () => {
    const result = await listAdminProducts({
      q: appliedQ || undefined,
      status: appliedStatus === "ALL" ? undefined : appliedStatus,
      categoryId: appliedCategoryId || undefined,
      productType: (appliedProductType as ProductType) || undefined,
      brandName: appliedBrandName || undefined,
      skip: page * pageSize,
      take: pageSize,
    });
    setItems(result.items);
    setTotal(result.total);
    if (result.statusCounts) setStatusCounts(result.statusCounts);
    setSelected(new Set());
    setError(null);
    setLoading(false);
  }, [
    appliedQ,
    appliedStatus,
    appliedCategoryId,
    appliedProductType,
    appliedBrandName,
    page,
    pageSize,
  ]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const result = await listAdminProducts({
          q: appliedQ || undefined,
          status: appliedStatus === "ALL" ? undefined : appliedStatus,
          categoryId: appliedCategoryId || undefined,
          productType: (appliedProductType as ProductType) || undefined,
          brandName: appliedBrandName || undefined,
          skip: page * pageSize,
          take: pageSize,
        });
        if (cancelled) return;
        setItems(result.items);
        setTotal(result.total);
        if (result.statusCounts) setStatusCounts(result.statusCounts);
        setSelected(new Set());
        setError(null);
      } catch {
        if (cancelled) return;
        setError("Unable to load products.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [
    appliedQ,
    appliedStatus,
    appliedCategoryId,
    appliedProductType,
    appliedBrandName,
    page,
    pageSize,
  ]);

  useEffect(() => {
    let cancelled = false;
    void listAdminCategories()
      .then((r) => {
        if (!cancelled) setCategories(r.items);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const allSelected = useMemo(
    () => items.length > 0 && items.every((p) => selected.has(p.id)),
    [items, selected],
  );

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(items.map((p) => p.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function applyFilters() {
    writeParams({
      q: draftQ.trim() || null,
      categoryId: draftCategoryId || null,
      productType: draftProductType || null,
      brand: draftBrandName.trim() || null,
      page: "1",
    });
  }

  function clearFilters() {
    setDraftQ("");
    setDraftCategoryId("");
    setDraftProductType("");
    setDraftBrandName("");
    writeParams({
      q: null,
      categoryId: null,
      productType: null,
      brand: null,
      page: "1",
    });
  }

  async function applyBulk() {
    const ids = [...selected];
    if (!ids.length || !bulkAction) return;
    try {
      if (bulkAction === "trash") {
        await Promise.all(
          ids.map((id) => transitionProduct(id, "ARCHIVED").catch(() => null)),
        );
      } else if (bulkAction === "unpublish") {
        await Promise.all(
          ids.map((id) =>
            transitionProduct(id, "UNPUBLISHED").catch(() => null),
          ),
        );
      } else if (bulkAction === "publish") {
        await Promise.all(
          ids.map((id) =>
            transitionProduct(id, "PUBLISHED").catch(() => null),
          ),
        );
      }
      setBulkAction("");
      await refreshList();
    } catch {
      setError("Bulk action failed.");
    }
  }

  async function onDuplicate(id: string) {
    try {
      const copy = await duplicateProduct(id);
      router.push(`/guardian/products/${copy.id}/edit`);
    } catch {
      setError("Duplicate failed.");
    }
  }

  async function onTrash(id: string) {
    try {
      await transitionProduct(id, "ARCHIVED");
      await refreshList();
    } catch {
      setError("Unable to move product to trash.");
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
                applyFilters();
              }}
            >
              <ClearableSearchInput
                value={draftQ}
                onChange={setDraftQ}
                onClear={() => {
                  setDraftQ("");
                  if (appliedQ) writeParams({ q: null, page: "1" });
                }}
                placeholder="Search products"
                className="w-full"
                aria-label="Search products"
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
                onClick={() => applyFilters()}
              >
                Apply
              </Button>
              <Button render={<Link href="/guardian/products/new" />}>
                Add product
              </Button>
            </div>
          </div>

          <CollapsibleFilterFields open={filtersOpen}>
            <div className="flex flex-col gap-3">
              {appliedFiltersActive ? (
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    onClick={clearFilters}
                  >
                    Clear filters
                  </Button>
                </div>
              ) : null}
              <div className={filterFieldsRowClassName}>
                <FilterControl
                  label="Status"
                  className={filterControlCompactClassName}
                >
                  <AppSelect
                    value={appliedStatus}
                    onValueChange={(next) =>
                      writeParams({
                        status: next === "ALL" ? null : next,
                        page: "1",
                      })
                    }
                    aria-label="Filter by status"
                    options={STATUS_TABS.map((tab) => {
                      const count =
                        statusCounts?.[tab.key] ??
                        (tab.key === "ALL" ? statusCounts?.ALL : undefined);
                      return {
                        value: tab.key,
                        label:
                          count !== undefined
                            ? `${tab.label} (${count})`
                            : tab.label,
                      };
                    })}
                  />
                </FilterControl>
                <FilterControl
                  label="Category"
                  className={filterControlCompactClassName}
                >
                  <AppSelect
                    value={draftCategoryId}
                    onValueChange={setDraftCategoryId}
                    aria-label="Select a category"
                    options={[
                      { value: "", label: "All categories" },
                      ...categories.map((c) => ({
                        value: c.id,
                        label: `${"— ".repeat(c.depth ?? 0)}${c.name}`,
                      })),
                    ]}
                  />
                </FilterControl>
                <FilterControl
                  label="Product type"
                  className={filterControlCompactClassName}
                >
                  <AppSelect
                    value={draftProductType}
                    onValueChange={setDraftProductType}
                    aria-label="Filter by product type"
                    options={[
                      { value: "", label: "All types" },
                      ...PRODUCT_TYPES.map((t) => ({
                        value: t,
                        label: t,
                      })),
                    ]}
                  />
                </FilterControl>
                <FilterControl
                  label="Brand"
                  className={filterControlCompactClassName}
                >
                  <div className="relative">
                    <Input
                      value={draftBrandName}
                      onChange={(e) => setDraftBrandName(e.target.value)}
                      placeholder="Filter by brand"
                      className="h-9 w-full pr-8"
                    />
                    {draftBrandName ? (
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label="Clear brand filter"
                        onClick={() => setDraftBrandName("")}
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                </FilterControl>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <AppSelect
                  size="default"
                  value={bulkAction}
                  onValueChange={setBulkAction}
                  aria-label="Bulk actions"
                  options={[
                    { value: "", label: "Bulk actions" },
                    { value: "publish", label: "Publish" },
                    { value: "unpublish", label: "Move to private" },
                    { value: "trash", label: "Move to trash" },
                  ]}
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!bulkAction || selected.size === 0}
                  onClick={() => void applyBulk()}
                >
                  Apply
                </Button>
              </div>
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
              title="No products found"
              description="Try a different search or filter."
            />
          }
          error={
            error ? (
              <ErrorState title="Unable to load products">{error}</ErrorState>
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
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead className="w-12" aria-label="Image" />
              <TableHead>Name</TableHead>
              <TableHead>ID</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Categories</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Brands</TableHead>
              <TableHead className="w-16 text-center">★</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((product) => {
              const primarySku = product.variants[0]?.sku ?? "—";
              const featuredSrc =
                product.featuredMediaAssetId ||
                product.media[0]?.mediaAssetId;
              const editHref = `/guardian/products/${product.id}/edit`;
              return (
                <ClickableTableRow
                  href={editHref}
                  key={product.id}
                  className="group align-top"
                  onMouseEnter={() => setHoveredId(product.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selected.has(product.id)}
                      onChange={() => toggleOne(product.id)}
                      aria-label={`Select ${product.name}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded border border-border bg-muted/30 text-[10px] text-muted-foreground">
                      {featuredSrc ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={featuredSrc}
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
                      className="font-semibold text-primary hover:underline"
                    >
                      {product.name}
                    </Link>
                    <div
                      className={cn(
                        "mt-1 text-xs leading-relaxed transition-opacity",
                        hoveredId === product.id
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-100",
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-x-1 text-primary">
                        <Link href={editHref} className="hover:underline">
                          Edit
                        </Link>
                        <span className="text-muted-foreground">|</span>
                        <Link
                          href={`${editHref}?quick=1`}
                          className="hover:underline"
                        >
                          Quick Edit
                        </Link>
                        <span className="text-muted-foreground">|</span>
                        <button
                          type="button"
                          className="text-destructive hover:underline"
                          onClick={() => void onTrash(product.id)}
                        >
                          Trash
                        </button>
                        <span className="text-muted-foreground">|</span>
                        <Link
                          href={`/guardian/products/${product.id}/history`}
                          className="hover:underline"
                        >
                          View
                        </Link>
                        <span className="text-muted-foreground">|</span>
                        <button
                          type="button"
                          className="hover:underline"
                          onClick={() => void onDuplicate(product.id)}
                        >
                          Duplicate
                        </button>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-55">
                    <code
                      className="block truncate text-xs text-muted-foreground"
                      title={product.id}
                    >
                      {product.id}
                    </code>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {primarySku}
                  </TableCell>
                  <TableCell>{formatPrice(product)}</TableCell>
                  <TableCell>
                    {product.categoryLinks.length
                      ? product.categoryLinks.map((link, i) => (
                          <span key={link.category.id}>
                            {i > 0 ? ", " : null}
                            <Link
                              href={`/guardian/categories/${link.category.id}/edit`}
                              className="text-primary hover:underline"
                            >
                              {link.category.name}
                            </Link>
                          </span>
                        ))
                      : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {product.tags.length ? product.tags.join(", ") : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {product.brandName || "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    <button
                      type="button"
                      title="Toggle featured"
                      className={
                        product.isFeatured
                          ? "text-amber-500"
                          : "text-muted-foreground/40 hover:text-amber-400"
                      }
                      onClick={() =>
                        void toggleProductFeatured(product.id).then(
                          refreshList,
                        )
                      }
                    >
                      ★
                    </button>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <div className="capitalize">
                      {product.lifecycleStatus === "UNPUBLISHED"
                        ? "Private"
                        : product.lifecycleStatus === "ARCHIVED"
                          ? "Trash"
                          : product.lifecycleStatus.toLowerCase()}
                    </div>
                    <div className="text-xs">
                      {formatDate(product.updatedAt ?? product.createdAt)}
                    </div>
                  </TableCell>
                </ClickableTableRow>
              );
            })}
          </TableBody>
        </DataTable>
      </PageBody>
    </ClinexaPage>
  );
}
