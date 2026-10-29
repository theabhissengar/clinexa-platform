"use client";

import { Inbox } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import {
  ClearableSearchInput,
  ClickableTableRow,
  ClinexaPage,
  DEFAULT_LIST_PAGE_SIZE,
  DataTable,
  EmptyState,
  ErrorState,
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
import { listAdminPayments } from "@/features/payments/api/admin-payments-api";
import type { PaymentListItem } from "@/features/payments/types";
import {
  formatDateTime,
  formatMoneyCents,
  statusLabel,
} from "@/features/orders/lib/format";

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

export function GuardianPaymentsListPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const appliedQ = searchParams.get("q") ?? "";
  const page = parsePage(searchParams.get("page"));
  const pageSize = parsePageSize(searchParams.get("take"));

  const [draftQ, setDraftQ] = useState(appliedQ);
  const [syncedQ, setSyncedQ] = useState(appliedQ);
  const [items, setItems] = useState<PaymentListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        const result = await listAdminPayments({
          q: appliedQ || undefined,
          skip: page * pageSize,
          take: pageSize,
        });
        if (cancelled) return;
        setItems(result.items);
        setTotal(result.total);
        setError(null);
      } catch {
        if (cancelled) return;
        setError("Unable to load payments.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [appliedQ, page, pageSize]);

  return (
    <ClinexaPage width="wide" className="gap-6">
      <PageBody>
        <FilterPanel>
          <div className="grid grid-cols-1 items-center gap-2 md:grid-cols-[minmax(0,1fr)_minmax(12rem,min(100%,28rem))_minmax(0,1fr)]">
            <div className="order-2 md:order-1" />
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
                placeholder="Search payment id, order, or provider ref"
                className="w-full"
                aria-label="Search payments"
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
        </FilterPanel>

        <DataTable
          framed
          stickyFirstColumn
          loading={loading}
          empty={!loading && !error && items.length === 0}
          emptyState={
            <EmptyState
              icon={<Inbox />}
              title="No payments found"
              description="Try a different search."
            />
          }
          error={
            error ? (
              <ErrorState title="Unable to load payments">{error}</ErrorState>
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
              <TableHead>Payment</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Lifecycle</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((row) => (
              <ClickableTableRow
                href={`/guardian/payments/${row.id}`}
                key={row.id}
              >
                <TableCell className="font-mono text-xs">
                  <Link
                    href={`/guardian/payments/${row.id}`}
                    className="font-semibold text-primary hover:underline"
                  >
                    {row.id.slice(0, 8)}…
                  </Link>
                </TableCell>
                <TableCell>
                  {row.order ? (
                    <Link
                      href={`/guardian/orders/${row.orderId}`}
                      className="text-primary hover:underline"
                    >
                      {row.order.orderNumber}
                    </Link>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="tabular-nums">
                  {formatMoneyCents(row.amountCents, row.currency)}
                </TableCell>
                <TableCell>{statusLabel(row.status)}</TableCell>
                <TableCell>{statusLabel(row.lifecycleState)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDateTime(row.createdAt)}
                </TableCell>
              </ClickableTableRow>
            ))}
          </TableBody>
        </DataTable>
      </PageBody>
    </ClinexaPage>
  );
}
