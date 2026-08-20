"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
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
import { ClearableSearchInput } from "@/features/products/components/clearable-search-input";
import { ListPaginationBar } from "@/features/products/components/list-pagination-bar";

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

  const [draftQ, setDraftQ] = useState(appliedQ);
  const [syncedQ, setSyncedQ] = useState(appliedQ);
  const [items, setItems] = useState<OrderListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
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
    appliedFrom,
    appliedTo,
    appliedArchived,
    includeDeleted,
    page,
  ]);

  function applySearch() {
    writeParams({ q: draftQ.trim() || null, page: "1" });
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Administrative order management (Class D): create, archive, restore,
            soft-delete, financial corrections, and overrides.
          </p>
        </div>
        {canCreate ? (
          <Button size="sm" render={<Link href="/guardian/orders/new" />}>
            Create order
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2 text-sm">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {STATUS_TABS.map((tab, index) => {
            const active = appliedStatus === tab.key;
            const count =
              tab.key === "ALL" ? statusCounts.ALL : statusCounts[tab.key];
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
                  {typeof count === "number" ? (
                    <span className="ml-1 text-muted-foreground">({count})</span>
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
            placeholder="Search orders"
            className="w-52"
            aria-label="Search orders"
          />
          <Button type="submit" size="sm" variant="outline">
            Search
          </Button>
        </form>
      </div>

      <div className="flex flex-wrap items-end gap-3 text-sm">
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
          <span className="text-muted-foreground">Archived</span>
          <select
            className="h-9 rounded-md border border-input bg-background px-2"
            value={appliedArchived}
            onChange={(event) =>
              writeParams({
                archived: event.target.value,
                page: "1",
              })
            }
          >
            {ARCHIVED_OPTIONS.map((opt) => (
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
        <label className="flex items-center gap-2 pb-2">
          <input
            type="checkbox"
            checked={includeDeleted}
            onChange={(event) =>
              writeParams({
                includeDeleted: event.target.checked ? "1" : null,
                page: "1",
              })
            }
          />
          <span className="text-muted-foreground">Include deleted</span>
        </label>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading orders…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No orders found.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Order</th>
                <th className="px-3 py-2 font-medium">Customer</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Total</th>
                <th className="px-3 py-2 font-medium">Created</th>
                <th className="px-3 py-2 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {items.map((order) => {
                const href = `/guardian/orders/${order.id}${
                  searchParams.toString()
                    ? `?return=${encodeURIComponent(`?${searchParams.toString()}`)}`
                    : ""
                }`;
                return (
                  <tr
                    key={order.id}
                    className={
                      hoveredId === order.id
                        ? "border-b border-border bg-muted/30"
                        : "border-b border-border"
                    }
                    onMouseEnter={() => setHoveredId(order.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={href}
                        className="font-medium text-primary hover:underline"
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
                    </td>
                    <td className="px-3 py-2">
                      <div>{customerLabel(order)}</div>
                      <div className="text-xs text-muted-foreground">
                        {order.customerEmail ?? "—"}
                      </div>
                    </td>
                    <td className="px-3 py-2">{statusLabel(order.status)}</td>
                    <td className="px-3 py-2">{statusLabel(order.orderType)}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {formatMoneyCents(order.totalCents, order.currency)}
                    </td>
                    <td className="px-3 py-2">
                      {formatDateTime(order.createdAt)}
                    </td>
                    <td className="px-3 py-2">
                      {formatDateTime(order.updatedAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ListPaginationBar
        total={total}
        page={page}
        pageCount={pageCount}
        onPrev={() => writeParams({ page: String(page) })}
        onNext={() => writeParams({ page: String(page + 2) })}
      />
    </main>
  );
}
