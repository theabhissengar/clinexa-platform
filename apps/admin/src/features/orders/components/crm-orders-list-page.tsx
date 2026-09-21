"use client";

import { Inbox } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import {
  ClearableSearchInput,
  ClinexaPage,
  DataTable,
  EmptyState,
  ErrorState,
  FilterBar,
  FilterBarGroup,
  FilterBarRow,
  ListPaginationBar,
  PageBody,
  PageHeader,
  PageHeaderCopy,
  PageHeaderDescription,
  PageHeaderTitle,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/patterns";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { listCrmOrders } from "@/features/orders/api/orders-api";
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
import { cn } from "@/lib/utils";

const STATUS_TABS: Array<{ key: OrderStatus | "ALL"; label: string }> = [
  { key: "ALL", label: "All" },
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

const STATUS_KEYS = new Set(STATUS_TABS.map((t) => t.key));
const TYPE_KEYS = new Set(TYPE_OPTIONS.map((t) => t.key));
const PAGE_SIZE = 20;

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

function parsePage(value: string | null): number {
  const n = Number(value ?? "1");
  if (!Number.isFinite(n) || n < 1) return 0;
  return Math.floor(n) - 1;
}

export function CrmOrdersListPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const appliedStatus = parseStatus(searchParams.get("status"));
  const appliedType = parseType(searchParams.get("orderType"));
  const appliedQ = searchParams.get("q") ?? "";
  const appliedPatient = searchParams.get("patientUserId") ?? "";
  const appliedFrom = searchParams.get("createdFrom") ?? "";
  const appliedTo = searchParams.get("createdTo") ?? "";
  const page = parsePage(searchParams.get("page"));

  const [draftQ, setDraftQ] = useState(appliedQ);
  const [syncedQ, setSyncedQ] = useState(appliedQ);
  const [items, setItems] = useState<OrderListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      try {
        const result = await listCrmOrders({
          q: appliedQ || undefined,
          status: appliedStatus === "ALL" ? undefined : appliedStatus,
          orderType: appliedType === "ALL" ? undefined : appliedType,
          patientUserId: appliedPatient || undefined,
          createdFrom: appliedFrom || undefined,
          createdTo: appliedTo || undefined,
          skip: page * PAGE_SIZE,
          take: PAGE_SIZE,
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
    appliedPatient,
    appliedFrom,
    appliedTo,
    page,
  ]);

  function applySearch() {
    writeParams({ q: draftQ.trim() || null, page: "1" });
  }

  return (
    <ClinexaPage width="wide" className="gap-6">
      <PageHeader>
        <PageHeaderCopy>
          <PageHeaderTitle>Orders</PageHeaderTitle>
          <PageHeaderDescription>
            Operational order queues. Create, delete, archive, restore, financial
            corrections, and overrides are Guardian-only.
          </PageHeaderDescription>
        </PageHeaderCopy>
      </PageHeader>

      <PageBody>
        <FilterBar>
          <FilterBarRow>
            <FilterBarGroup className="flex-wrap gap-x-3 gap-y-1 text-sm">
              {STATUS_TABS.map((tab, index) => {
                const active = appliedStatus === tab.key;
                const count =
                  tab.key === "ALL"
                    ? statusCounts.ALL
                    : statusCounts[tab.key];
                return (
                  <span
                    key={tab.key}
                    className="inline-flex items-center gap-3"
                  >
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
                      className={cn(
                        active
                          ? "font-medium text-foreground"
                          : "text-primary hover:underline",
                      )}
                    >
                      {tab.label}
                      {typeof count === "number" ? (
                        <span className="ml-1 text-muted-foreground">
                          ({count})
                        </span>
                      ) : null}
                    </button>
                  </span>
                );
              })}
            </FilterBarGroup>
            <FilterBarGroup>
              <form
                className="flex flex-wrap gap-2"
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
                  className="w-52"
                  aria-label="Search orders"
                />
                <Button type="submit" size="sm" variant="outline">
                  Search
                </Button>
              </form>
            </FilterBarGroup>
          </FilterBarRow>
          <FilterBarRow>
            <FilterBarGroup className="flex flex-wrap items-end gap-3 text-sm">
              <label className="flex flex-col gap-1">
                <span className="text-muted-foreground">Order type</span>
                <select
                  className="h-9 rounded-md border border-input bg-background px-2"
                  value={appliedType}
                  onChange={(event) =>
                    writeParams({
                      orderType:
                        event.target.value === "ALL" ? null : event.target.value,
                      page: "1",
                    })
                  }
                >
                  {TYPE_OPTIONS.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-muted-foreground">Created from</span>
                <input
                  type="date"
                  className="h-9 rounded-md border border-input bg-background px-2"
                  value={appliedFrom.slice(0, 10)}
                  onChange={(event) =>
                    writeParams({
                      createdFrom: event.target.value
                        ? new Date(event.target.value).toISOString()
                        : null,
                      page: "1",
                    })
                  }
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-muted-foreground">Created to</span>
                <input
                  type="date"
                  className="h-9 rounded-md border border-input bg-background px-2"
                  value={appliedTo.slice(0, 10)}
                  onChange={(event) =>
                    writeParams({
                      createdTo: event.target.value
                        ? new Date(
                            `${event.target.value}T23:59:59.999Z`,
                          ).toISOString()
                        : null,
                      page: "1",
                    })
                  }
                />
              </label>
              {appliedPatient ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    writeParams({ patientUserId: null, page: "1" })
                  }
                >
                  Clear patient filter
                </Button>
              ) : null}
            </FilterBarGroup>
          </FilterBarRow>
        </FilterBar>

        <DataTable
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
              <TableHead>Payment</TableHead>
              <TableHead>Clinical</TableHead>
              <TableHead>Fulfillment</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((order) => {
              const href = `/crm/orders/${order.id}${
                searchParams.toString()
                  ? `?return=${encodeURIComponent(`?${searchParams.toString()}`)}`
                  : ""
              }`;
              return (
                <TableRow key={order.id} className="align-top">
                  <TableCell>
                    <Link
                      href={href}
                      className="font-semibold text-primary hover:underline"
                    >
                      {order.orderNumber}
                    </Link>
                    {order.subscriptionId ? (
                      <div className="text-xs text-muted-foreground">
                        Sub ref
                      </div>
                    ) : null}
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
                  <TableCell>
                    {order.paymentStatusSummary ?? "—"}
                  </TableCell>
                  <TableCell>
                    {order.isRxOrder
                      ? order.requiresClinicalReview
                        ? "Rx · review"
                        : "Rx"
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {order.shippedAt
                      ? `Shipped ${formatDateTime(order.shippedAt)}`
                      : (order.trackingNumber ?? "—")}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatMoneyCents(order.totalCents, order.currency)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(order.createdAt)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </DataTable>
      </PageBody>
    </ClinexaPage>
  );
}
