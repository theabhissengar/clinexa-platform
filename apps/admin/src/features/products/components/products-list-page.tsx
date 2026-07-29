"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

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
import { ClearableSearchInput } from "./clearable-search-input";
import { ListPaginationBar } from "./list-pagination-bar";

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
const PAGE_SIZE = 20;

const STATUS_KEYS = new Set(STATUS_TABS.map((t) => t.key));

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

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const appliedFiltersActive = Boolean(
    appliedQ || appliedCategoryId || appliedProductType || appliedBrandName,
  );

  // Sync draft filters when URL applied filters change (back/forward/clear).
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
      skip: page * PAGE_SIZE,
      take: PAGE_SIZE,
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
          skip: page * PAGE_SIZE,
          take: PAGE_SIZE,
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

  function applySearch() {
    writeParams({
      q: draftQ.trim() || null,
      page: "1",
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
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Catalog master data. Store consumes published products only.
          </p>
        </div>
        <Button render={<Link href="/guardian/products/new" />}>
          Add product
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2 text-sm">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {STATUS_TABS.map((tab, index) => {
            const count =
              statusCounts?.[tab.key] ??
              (tab.key === "ALL" ? statusCounts?.ALL : undefined);
            const active = appliedStatus === tab.key;
            return (
              <span key={tab.key} className="inline-flex items-center gap-3">
                {index > 0 ? (
                  <span className="text-muted-foreground/40">|</span>
                ) : null}
                <button
                  type="button"
                  onClick={() =>
                    writeParams({
                      status: tab.key === "ALL" ? null : tab.key,
                      page: "1",
                    })
                  }
                  className={
                    active
                      ? "font-medium text-foreground"
                      : "text-primary hover:underline"
                  }
                >
                  {tab.label}
                  {count !== undefined ? (
                    <span className="text-muted-foreground"> ({count})</span>
                  ) : null}
                </button>
              </span>
            );
          })}
        </div>
        <form
          className="flex gap-2"
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
            placeholder="Search products"
            className="w-52"
            aria-label="Search products"
          />
          <Button type="submit" size="sm" variant="outline">
            Search products
          </Button>
        </form>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-8 rounded-md border border-border bg-background px-2 text-sm"
          value={bulkAction}
          onChange={(e) => setBulkAction(e.target.value)}
        >
          <option value="">Bulk actions</option>
          <option value="publish">Publish</option>
          <option value="unpublish">Move to private</option>
          <option value="trash">Move to trash</option>
        </select>
        <Button
          size="sm"
          variant="outline"
          disabled={!bulkAction || selected.size === 0}
          onClick={() => void applyBulk()}
        >
          Apply
        </Button>

        <select
          className="h-8 rounded-md border border-border bg-background px-2 text-sm"
          value={draftCategoryId}
          onChange={(e) => setDraftCategoryId(e.target.value)}
        >
          <option value="">Select a category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {"— ".repeat(c.depth ?? 0)}
              {c.name}
            </option>
          ))}
        </select>
        <select
          className="h-8 rounded-md border border-border bg-background px-2 text-sm"
          value={draftProductType}
          onChange={(e) => setDraftProductType(e.target.value)}
        >
          <option value="">Filter by product type</option>
          {PRODUCT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <div className="relative">
          <Input
            value={draftBrandName}
            onChange={(e) => setDraftBrandName(e.target.value)}
            placeholder="Filter by brand"
            className="h-8 w-40 pr-8"
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
        <Button size="sm" variant="outline" onClick={applyFilters}>
          Filter
        </Button>
        {appliedFiltersActive ? (
          <Button size="sm" variant="ghost" onClick={clearFilters}>
            Clear
          </Button>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-300 text-left text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Select all"
                  />
                </th>
                <th className="w-12 px-2 py-2" aria-label="Image" />
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">ID</th>
                <th className="px-3 py-2 font-medium">SKU</th>
                <th className="px-3 py-2 font-medium">Price</th>
                <th className="px-3 py-2 font-medium">Categories</th>
                <th className="px-3 py-2 font-medium">Tags</th>
                <th className="px-3 py-2 font-medium">Brands</th>
                <th className="w-16 px-3 py-2 font-medium text-center">★</th>
                <th className="px-3 py-2 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {items.map((product) => {
                const primarySku = product.variants[0]?.sku ?? "—";
                const featuredSrc =
                  product.featuredMediaAssetId ||
                  product.media[0]?.mediaAssetId;
                const editHref = `/guardian/products/${product.id}/edit`;
                return (
                  <tr
                    key={product.id}
                    className="group border-t border-border align-top hover:bg-muted/20"
                    onMouseEnter={() => setHoveredId(product.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(product.id)}
                        onChange={() => toggleOne(product.id)}
                        aria-label={`Select ${product.name}`}
                      />
                    </td>
                    <td className="px-2 py-3">
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
                    </td>
                    <td className="px-3 py-3">
                      <Link
                        href={editHref}
                        className="font-semibold text-primary hover:underline"
                      >
                        {product.name}
                      </Link>
                      <div
                        className={`mt-1 text-xs leading-relaxed transition-opacity ${
                          hoveredId === product.id
                            ? "opacity-100"
                            : "opacity-0 group-hover:opacity-100"
                        }`}
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
                    </td>
                    <td className="max-w-55 px-3 py-3">
                      <code
                        className="block truncate text-xs text-muted-foreground"
                        title={product.id}
                      >
                        {product.id}
                      </code>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {primarySku}
                    </td>
                    <td className="px-3 py-3">{formatPrice(product)}</td>
                    <td className="px-3 py-3">
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
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {product.tags.length ? product.tags.join(", ") : "—"}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {product.brandName || "—"}
                    </td>
                    <td className="px-3 py-3 text-center">
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
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
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
                    </td>
                  </tr>
                );
              })}
              {!items.length ? (
                <tr>
                  <td
                    colSpan={11}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    No products found.
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
