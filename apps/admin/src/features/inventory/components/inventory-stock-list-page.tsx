"use client";

import { Inbox } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import {
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
  filterInlineCheckboxClassName,
} from "@/components/patterns";
import { Button } from "@/components/ui/button";

import { listBalances } from "../api/inventory-api";
import type { InventoryBalanceRow } from "../types";
import { InventorySubnav } from "./inventory-subnav";

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

export function InventoryStockListPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const appliedQ = searchParams.get("q") ?? "";
  const lowOnly = searchParams.get("lowStockOnly") === "1";
  const page = parsePage(searchParams.get("page"));
  const pageSize = parsePageSize(searchParams.get("take"));

  const [draftQ, setDraftQ] = useState(appliedQ);
  const [syncedQ, setSyncedQ] = useState(appliedQ);
  const [items, setItems] = useState<InventoryBalanceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);

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
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function applySearch() {
    writeParams({ q: draftQ.trim() || null, page: "1" });
  }

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      try {
        const res = await listBalances({
          q: appliedQ || undefined,
          lowStockOnly: lowOnly || undefined,
          skip: page * pageSize,
          take: pageSize,
        });
        if (cancelled) return;
        setItems(res.items);
        setTotal(res.total);
        setError(null);
      } catch {
        if (cancelled) return;
        setError("Unable to load stock.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [appliedQ, lowOnly, page, pageSize]);

  return (
    <ClinexaPage width="wide" className="gap-6">
      <PageBody>
        <InventorySubnav />

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
                placeholder="Search SKU or product"
                className="w-full"
                aria-label="Search stock"
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
            </div>
          </div>

          <CollapsibleFilterFields open={filtersOpen}>
            <div className="flex flex-wrap items-end gap-3">
              <label className={filterInlineCheckboxClassName}>
                <input
                  type="checkbox"
                  className="size-4 rounded border-border"
                  checked={lowOnly}
                  onChange={(event) =>
                    writeParams({
                      lowStockOnly: event.target.checked ? "1" : null,
                      page: "1",
                    })
                  }
                />
                Low stock only
              </label>
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
              title="No stock balances"
              description="Try a different search or clear the low-stock filter."
            />
          }
          error={
            error ? (
              <ErrorState title="Unable to load stock">{error}</ErrorState>
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
              <TableHead>SKU</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>On hand</TableHead>
              <TableHead>Reserved</TableHead>
              <TableHead>Available</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((row) => (
              <ClickableTableRow
                href={`/guardian/inventory/stock/${row.productVariantId}`}
                key={row.productVariantId}
              >
                <TableCell className="font-mono text-xs">{row.sku}</TableCell>
                <TableCell>{row.productName}</TableCell>
                <TableCell>{row.quantityOnHand}</TableCell>
                <TableCell>{row.quantityReserved}</TableCell>
                <TableCell>
                  {row.available}
                  {row.lowStock ? (
                    <span className="ml-2 text-xs text-destructive">low</span>
                  ) : null}
                </TableCell>
                <TableCell>
                  <Link
                    className="text-primary hover:underline"
                    href={`/guardian/inventory/stock/${row.productVariantId}`}
                  >
                    Open
                  </Link>
                </TableCell>
              </ClickableTableRow>
            ))}
          </TableBody>
        </DataTable>
      </PageBody>
    </ClinexaPage>
  );
}
