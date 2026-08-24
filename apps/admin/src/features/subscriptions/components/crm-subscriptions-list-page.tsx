"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ClearableSearchInput } from "@/features/products/components/clearable-search-input";
import { ListPaginationBar } from "@/features/products/components/list-pagination-bar";
import { listCrmSubscriptions } from "@/features/subscriptions/api/subscriptions-api";
import {
  customerLabel,
  formatDateTime,
  statusLabel,
} from "@/features/subscriptions/lib/format";
import type {
  SubscriptionListItem,
  SubscriptionStatus,
} from "@/features/subscriptions/types";

const STATUS_TABS: Array<{ key: SubscriptionStatus | "ALL"; label: string }> = [
  { key: "ALL", label: "All" },
  { key: "PENDING_SETUP", label: "Pending setup" },
  { key: "ACTIVE", label: "Active" },
  { key: "PAUSED", label: "Paused" },
  { key: "PAST_DUE", label: "Past due" },
  { key: "CANCELLED", label: "Cancelled" },
  { key: "EXPIRED", label: "Expired" },
  { key: "COMPLETED", label: "Completed" },
];

const STATUS_KEYS = new Set(STATUS_TABS.map((tab) => tab.key));
const PAGE_SIZE = 20;

function parseStatus(value: string | null): SubscriptionStatus | "ALL" {
  if (value && STATUS_KEYS.has(value as SubscriptionStatus | "ALL")) {
    return value as SubscriptionStatus | "ALL";
  }
  return "ALL";
}

function parsePage(value: string | null): number {
  const n = Number(value ?? "1");
  if (!Number.isFinite(n) || n < 1) return 0;
  return Math.floor(n) - 1;
}

export function CrmSubscriptionsListPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const appliedStatus = parseStatus(searchParams.get("status"));
  const appliedQ = searchParams.get("q") ?? "";
  const appliedPlan = searchParams.get("planId") ?? "";
  const appliedPatient = searchParams.get("patientUserId") ?? "";
  const appliedFrom = searchParams.get("nextRenewalFrom") ?? "";
  const appliedTo = searchParams.get("nextRenewalTo") ?? "";
  const page = parsePage(searchParams.get("page"));

  const [draftQ, setDraftQ] = useState(appliedQ);
  const [syncedQ, setSyncedQ] = useState(appliedQ);
  const [items, setItems] = useState<SubscriptionListItem[]>([]);
  const [plans, setPlans] = useState<
    Array<{ id: string; name: string; lifecycleStatus: string }>
  >([]);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

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
        const result = await listCrmSubscriptions({
          q: appliedQ || undefined,
          status: appliedStatus === "ALL" ? undefined : appliedStatus,
          planId: appliedPlan || undefined,
          patientUserId: appliedPatient || undefined,
          nextRenewalFrom: appliedFrom || undefined,
          nextRenewalTo: appliedTo || undefined,
          skip: page * PAGE_SIZE,
          take: PAGE_SIZE,
        });
        if (cancelled) return;
        setItems(result.items);
        setTotal(result.total);
        setStatusCounts(result.statusCounts ?? {});
        setPlans(result.plans ?? []);
        setError(null);
      } catch {
        if (cancelled) return;
        setError("Unable to load subscriptions.");
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
    appliedPlan,
    appliedPatient,
    appliedFrom,
    appliedTo,
    page,
  ]);

  const hasFilters =
    Boolean(appliedQ) ||
    appliedStatus !== "ALL" ||
    Boolean(appliedPlan) ||
    Boolean(appliedPatient) ||
    Boolean(appliedFrom) ||
    Boolean(appliedTo);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Subscriptions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Operational subscription assist. Create, delete, archive, restore,
          corrections, and overrides are Guardian-only.
        </p>
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
            writeParams({ q: draftQ.trim() || null, page: "1" });
          }}
        >
          <ClearableSearchInput
            value={draftQ}
            onChange={setDraftQ}
            onClear={() => {
              setDraftQ("");
              if (appliedQ) writeParams({ q: null, page: "1" });
            }}
            placeholder="Search subscriptions"
            className="w-52"
            aria-label="Search subscriptions"
          />
          <Button type="submit" size="sm" variant="outline">
            Search
          </Button>
        </form>
      </div>

      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Plan</span>
          <select
            className="h-9 rounded-md border border-input bg-background px-2"
            value={appliedPlan}
            onChange={(event) =>
              writeParams({
                planId: event.target.value || null,
                page: "1",
              })
            }
          >
            <option value="">All plans</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Next renewal from</span>
          <input
            type="date"
            className="h-9 rounded-md border border-input bg-background px-2"
            value={appliedFrom.slice(0, 10)}
            onChange={(event) =>
              writeParams({
                nextRenewalFrom: event.target.value
                  ? new Date(event.target.value).toISOString()
                  : null,
                page: "1",
              })
            }
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Next renewal to</span>
          <input
            type="date"
            className="h-9 rounded-md border border-input bg-background px-2"
            value={appliedTo.slice(0, 10)}
            onChange={(event) =>
              writeParams({
                nextRenewalTo: event.target.value
                  ? new Date(
                      `${event.target.value}T23:59:59.999Z`,
                    ).toISOString()
                  : null,
                page: "1",
              })
            }
          />
        </label>
        {hasFilters ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDraftQ("");
              router.push(pathname);
            }}
          >
            Clear filters
          </Button>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading subscriptions…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No subscriptions found.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-270 text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Subscription</th>
                <th className="px-3 py-2 font-medium">Patient</th>
                <th className="px-3 py-2 font-medium">Plan</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Period / renewal</th>
                <th className="px-3 py-2 font-medium">Cycle</th>
                <th className="px-3 py-2 font-medium">Payment</th>
                <th className="px-3 py-2 font-medium">Clinical</th>
                <th className="px-3 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => {
                const href = `/crm/subscriptions/${row.id}${
                  searchParams.toString()
                    ? `?return=${encodeURIComponent(`?${searchParams.toString()}`)}`
                    : ""
                }`;
                return (
                  <tr
                    key={row.id}
                    className={
                      hoveredId === row.id
                        ? "border-b border-border bg-muted/30"
                        : "border-b border-border"
                    }
                    onMouseEnter={() => setHoveredId(row.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={href}
                        className="font-medium text-primary hover:underline"
                      >
                        {row.subscriptionNumber ?? row.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <div>{customerLabel(row)}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.customerEmail ?? "—"}
                      </div>
                    </td>
                    <td className="px-3 py-2">{row.plan?.name ?? "—"}</td>
                    <td className="px-3 py-2">{statusLabel(row.status)}</td>
                    <td className="px-3 py-2">
                      <div>{formatDateTime(row.currentPeriodEnd)}</div>
                      <div className="text-xs text-muted-foreground">
                        Next {formatDateTime(row.nextRenewalAt)}
                      </div>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{row.cycleNumber}</td>
                    <td className="px-3 py-2">
                      {row.paymentStatusSummary ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      {statusLabel(row.clinicalRequirement)}
                    </td>
                    <td className="px-3 py-2">
                      {formatDateTime(row.createdAt)}
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
