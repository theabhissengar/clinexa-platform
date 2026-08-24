"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { listAdminSubscriptionPlans } from "@/features/subscriptions/api/admin-subscription-plans-api";
import {
  formatMoneyCents,
  intervalLabel,
  statusLabel,
} from "@/features/subscriptions/lib/format";
import type {
  SubscriptionPlan,
  SubscriptionPlanStatus,
} from "@/features/subscriptions/types";
import { ClearableSearchInput } from "@/features/products/components/clearable-search-input";
import { ListPaginationBar } from "@/features/products/components/list-pagination-bar";

const STATUS_TABS: Array<{
  key: SubscriptionPlanStatus | "ALL";
  label: string;
}> = [
  { key: "ALL", label: "All" },
  { key: "DRAFT", label: "Draft" },
  { key: "PUBLISHED", label: "Published" },
  { key: "UNPUBLISHED", label: "Unpublished" },
  { key: "ARCHIVED", label: "Archived" },
];

const STATUS_KEYS = new Set(STATUS_TABS.map((tab) => tab.key));
const PAGE_SIZE = 20;

function parseStatus(value: string | null): SubscriptionPlanStatus | "ALL" {
  if (value && STATUS_KEYS.has(value as SubscriptionPlanStatus | "ALL")) {
    return value as SubscriptionPlanStatus | "ALL";
  }
  return "ALL";
}

function parsePage(value: string | null): number {
  const n = Number(value ?? "1");
  if (!Number.isFinite(n) || n < 1) return 0;
  return Math.floor(n) - 1;
}

export function GuardianSubscriptionPlansListPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const appliedStatus = parseStatus(searchParams.get("status"));
  const appliedQ = searchParams.get("q") ?? "";
  const page = parsePage(searchParams.get("page"));

  const [draftQ, setDraftQ] = useState(appliedQ);
  const [syncedQ, setSyncedQ] = useState(appliedQ);
  const [items, setItems] = useState<SubscriptionPlan[]>([]);
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
        const result = await listAdminSubscriptionPlans({
          q: appliedQ || undefined,
          status: appliedStatus === "ALL" ? undefined : appliedStatus,
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
        setError("Unable to load plans.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [appliedQ, appliedStatus, page]);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/guardian/subscriptions"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            ← Subscriptions
          </Link>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">
            Subscription plans
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure and publish plans. Archive uses plan configure
            permission, not subscription Class D.
          </p>
        </div>
        <Button
          size="sm"
          render={<Link href="/guardian/subscriptions/plans/new" />}
        >
          Create plan
        </Button>
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
            placeholder="Search plans"
            className="w-52"
            aria-label="Search plans"
          />
          <Button type="submit" size="sm" variant="outline">
            Search
          </Button>
        </form>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading plans…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No plans found.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-225 text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Plan</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Interval</th>
                <th className="px-3 py-2 font-medium">Price</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((plan) => (
                <tr key={plan.id} className="border-b border-border">
                  <td className="px-3 py-2">
                    <div className="font-medium">{plan.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {plan.slug}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {statusLabel(plan.lifecycleStatus)}
                  </td>
                  <td className="px-3 py-2">
                    {intervalLabel(plan.billingInterval, plan.intervalCount)}
                  </td>
                  <td className="px-3 py-2">
                    {formatMoneyCents(plan.priceCents, plan.currency)}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/guardian/subscriptions/plans/${plan.id}/edit`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
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
