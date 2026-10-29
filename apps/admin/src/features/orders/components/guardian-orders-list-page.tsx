"use client";

import { Inbox } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import {
  AppSelect,
  ClearableSearchInput,
  ClickableTableRow,
  ClinexaPage,
  CollapsibleFilterFields,
  DataTable,
  DateField,
  EmptyState,
  ErrorState,
  FilterControl,
  FilterFieldsToggle,
  FilterPanel,
  DEFAULT_LIST_PAGE_SIZE,
  LIST_PAGE_SIZE_OPTIONS,
  ListPaginationBar,
  PageBody,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  filterControlCompactClassName,
  filterFieldsRowClassName,
  filterInlineCheckboxClassName,
  filterApplyButtonClassName,
} from "@/components/patterns";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { usePermissions } from "@/features/auth/hooks/use-permissions";
import { Permissions } from "@/features/auth/permissions";
import { listAdminOrders } from "@/features/orders/api/admin-orders-api";
import {
  customerLabel,
  formatDateTime,
  formatMoneyCents,
  statusLabel,
} from "@/features/orders/lib/format";
import type {
  OrderListItem,
  OrderStatus,
  OrderType,
} from "@/features/orders/types";

const STATUS_TABS: Array<{ key: OrderStatus | "ALL"; label: string }> = [
  { key: "ALL", label: "All" },
  { key: "DRAFT", label: "Draft" },
  { key: "PAYMENT_PENDING", label: "Payment pending" },
  { key: "AWAITING_CLINICAL_REVIEW", label: "Clinical review" },
  { key: "AWAITING_FULFILLMENT", label: "Awaiting fulfillment" },
  { key: "FULFILLED", label: "Fulfilled" },
  { key: "CANCELLED", label: "Cancelled" },
  { key: "REFUNDED", label: "Refunded" },
];

const TYPE_OPTIONS: Array<{ key: OrderType | "ALL"; label: string }> = [
  { key: "ALL", label: "All types" },
  { key: "ONE_TIME", label: "One-time" },
  { key: "SUBSCRIPTION_INITIAL", label: "Subscription initial" },
  { key: "SUBSCRIPTION_RENEWAL", label: "Subscription renewal" },
];

const ARCHIVED_OPTIONS: Array<{
  key: "ALL" | "ACTIVE" | "ARCHIVED";
  label: string;
}> = [
  { key: "ACTIVE", label: "Active" },
  { key: "ARCHIVED", label: "Archived" },
  { key: "ALL", label: "All" },
];

const STATUS_KEYS = new Set(STATUS_TABS.map((t) => t.key));
const TYPE_KEYS = new Set(TYPE_OPTIONS.map((t) => t.key));
const ARCHIVED_KEYS = new Set(ARCHIVED_OPTIONS.map((t) => t.key));
const PAGE_SIZE_SET = new Set<number>(LIST_PAGE_SIZE_OPTIONS);

function parseStatus(value: string | null): OrderStatus | "ALL" {
  if (value && STATUS_KEYS.has(value as OrderStatus | "ALL")) {
    return value as OrderStatus | "ALL";
  }
  return "ALL";
}

function parseType(value: string | null): OrderType | "ALL" {
  if (value && TYPE_KEYS.has(value as OrderType | "ALL")) {
    return value as OrderType | "ALL";
  }
  return "ALL";
}

function parseArchived(value: string | null): "ALL" | "ACTIVE" | "ARCHIVED" {
  if (value && ARCHIVED_KEYS.has(value as "ALL" | "ACTIVE" | "ARCHIVED")) {
    return value as "ALL" | "ACTIVE" | "ARCHIVED";
  }
  return "ACTIVE";
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

export function GuardianOrdersListPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { can } = usePermissions();

  const appliedStatus = parseStatus(searchParams.get("status"));
  const appliedType = parseType(searchParams.get("orderType"));
  const appliedQ = searchParams.get("q") ?? "";
  const appliedFrom = searchParams.get("createdFrom") ?? "";
  const appliedTo = searchParams.get("createdTo") ?? "";
  const appliedArchived = parseArchived(searchParams.get("archived"));
  const includeDeleted = searchParams.get("includeDeleted") === "1";
  const page = parsePage(searchParams.get("page"));
  const pageSize = parsePageSize(searchParams.get("take"));

  const [draftQ, setDraftQ] = useState(appliedQ);
  const [syncedQ, setSyncedQ] = useState(appliedQ);
  const [items, setItems] = useState<OrderListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const canCreate = can(Permissions.ORD_CREATE);

  if (appliedQ !== syncedQ) {
    setSyncedQ(appliedQ);
    setDraftQ(appliedQ);
  }

  function writeParams(patch: Record<string, string | null | undefined>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value == null || value === "" || value === "ALL") next.delete(key);
      else next.set(key, value);
    }
    // Keep archived=ALL explicit so parseArchived does not fall back to ACTIVE
    if (patch.archived === "ALL") next.set("archived", "ALL");
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      try {
        const result = await listAdminOrders({
          q: appliedQ || undefined,
          status: appliedStatus === "ALL" ? undefined : appliedStatus,
          orderType: appliedType === "ALL" ? undefined : appliedType,
          createdFrom: appliedFrom || undefined,
          createdTo: appliedTo || undefined,
          archived: appliedArchived,
          includeDeleted: includeDeleted || undefined,
          skip: page * pageSize,
          take: pageSize,
        });
        if (cancelled) return;
        setItems(result.items);
        setTotal(result.total);
        setStatusCounts(result.statusCounts ?? {});
        setError(null);
      } catch {
        if (cancelled) return;
        setError("Unable to load orders.");
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
    appliedType,
    appliedFrom,
    appliedTo,
    appliedArchived,
    includeDeleted,
    page,
    pageSize,
  ]);

  function applySearch() {
    writeParams({ q: draftQ.trim() || null, page: "1" });
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
                placeholder="Search orders"
                className="w-full"
                aria-label="Search orders"
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
              {canCreate ? (
                <Button size="sm" render={<Link href="/guardian/orders/new" />}>
                  Create order
                </Button>
              ) : null}
            </div>
          </div>

          <CollapsibleFilterFields open={filtersOpen}>
            <div className={filterFieldsRowClassName}>
              <FilterControl label="Status" className={filterControlCompactClassName}>
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
                      tab.key === "ALL"
                        ? statusCounts.ALL
                        : statusCounts[tab.key];
                    return {
                      value: tab.key,
                      label:
                        typeof count === "number"
                          ? `${tab.label} (${count})`
                          : tab.label,
                    };
                  })}
                />
              </FilterControl>
              <FilterControl
                label="Order type"
                className={filterControlCompactClassName}
              >
                <AppSelect
                  value={appliedType}
                  onValueChange={(next) =>
                    writeParams({
                      orderType: next === "ALL" ? null : next,
                      page: "1",
                    })
                  }
                  options={TYPE_OPTIONS.map((opt) => ({
                    value: opt.key,
                    label: opt.label,
                  }))}
                />
              </FilterControl>
              <FilterControl
                label="Archived"
                className={filterControlCompactClassName}
              >
                <AppSelect
                  value={appliedArchived}
                  onValueChange={(next) =>
                    writeParams({ archived: next, page: "1" })
                  }
                  options={ARCHIVED_OPTIONS.map((opt) => ({
                    value: opt.key,
                    label: opt.label,
                  }))}
                />
              </FilterControl>
              <FilterControl
                label="Created from"
                className={filterControlCompactClassName}
              >
                <DateField
                  value={appliedFrom.slice(0, 10)}
                  onChange={(day) =>
                    writeParams({
                      createdFrom: day
                        ? new Date(day).toISOString()
                        : null,
                      page: "1",
                    })
                  }
                  aria-label="Created from"
                />
              </FilterControl>
              <FilterControl
                label="Created to"
                className={filterControlCompactClassName}
              >
                <DateField
                  value={appliedTo.slice(0, 10)}
                  onChange={(day) =>
                    writeParams({
                      createdTo: day
                        ? new Date(`${day}T23:59:59.999Z`).toISOString()
                        : null,
                      page: "1",
                    })
                  }
                  aria-label="Created to"
                />
              </FilterControl>
              <label className={filterInlineCheckboxClassName}>
                <input
                  type="checkbox"
                  className="size-4 rounded border-border"
                  checked={includeDeleted}
                  onChange={(event) =>
                    writeParams({
                      includeDeleted: event.target.checked ? "1" : null,
                      page: "1",
                    })
                  }
                />
                Include deleted
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
              title="No orders found"
              description="Try a different search or status filter."
            />
          }
          error={
            error ? (
              <ErrorState title="Unable to load orders">{error}</ErrorState>
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
              <TableHead>Order</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((order) => {
              const href = `/guardian/orders/${order.id}${
                searchParams.toString()
                  ? `?return=${encodeURIComponent(`?${searchParams.toString()}`)}`
                  : ""
              }`;
              return (
                <ClickableTableRow href={href} key={order.id} className="align-top">
                  <TableCell>
                    <Link
                      href={href}
                      className="font-semibold text-primary hover:underline"
                    >
                      {order.orderNumber}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {order.archivedAt ? (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                          Archived
                        </span>
                      ) : null}
                      {order.deletedAt ? (
                        <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">
                          Deleted
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>{customerLabel(order)}</div>
                    <div className="text-xs text-muted-foreground">
                      {order.customerEmail ?? "—"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={order.status} />
                  </TableCell>
                  <TableCell>{statusLabel(order.orderType)}</TableCell>
                  <TableCell className="tabular-nums">
                    {formatMoneyCents(order.totalCents, order.currency)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(order.createdAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(order.updatedAt)}
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
