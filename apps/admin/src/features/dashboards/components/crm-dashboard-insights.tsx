"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Banknote,
  CircleDollarSign,
  Package,
  RefreshCw,
  TrendingUp,
} from "lucide-react";

import {
  EmptyState,
  ErrorState,
  PageSkeleton,
} from "@/components/patterns";
import { formatMoneyCents } from "@/features/orders/lib/format";
import type { OrderListItem, OrderListResponse } from "@/features/orders/types";
import { cn } from "@/lib/utils";

import {
  SoftBarChart,
  SoftCard,
  SoftCardHeader,
  SoftRingStat,
} from "./soft-dashboard";

const REVENUE_STATUSES = new Set([
  "PAYMENT_PENDING",
  "AWAITING_CLINICAL_REVIEW",
  "CLINICAL_APPROVED",
  "AWAITING_FULFILLMENT",
  "FULFILLED",
]);

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayLabel(key: string): string {
  const [, m, d] = key.split("-");
  return `${m}/${d}`;
}

function dayTitle(key: string): string {
  const [y, m, d] = key.split("-");
  return `${m}/${d}/${y}`;
}

function buildDayWindow(items: OrderListItem[]): string[] {
  const keys: string[] = [];
  const anchor =
    items.length > 0
      ? items.reduce((newest, order) => {
          return new Date(order.createdAt) > new Date(newest)
            ? order.createdAt
            : newest;
        }, items[0]!.createdAt)
      : new Date().toISOString();
  const end = new Date(anchor);
  end.setHours(12, 0, 0, 0);
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    keys.push(dayKey(d.toISOString()));
  }
  return keys;
}

function revenueEligible(order: OrderListItem): boolean {
  return REVENUE_STATUSES.has(order.status) && order.totalCents > 0;
}

function groupRenewalsByDay(items: OrderListItem[]) {
  const days = buildDayWindow(items);
  const map = new Map<string, OrderListItem[]>();
  for (const key of days) map.set(key, []);
  for (const order of items) {
    const key = dayKey(order.createdAt);
    if (map.has(key)) {
      map.get(key)!.push(order);
    }
  }
  return { days, map };
}

export function buildCrmInsightMetrics(
  orders: OrderListResponse | null,
  patientsTotal: number,
) {
  const items = orders?.items ?? [];
  const eligible = items.filter(revenueEligible);
  const currency = eligible[0]?.currency ?? items[0]?.currency ?? "USD";
  const revenueCents = eligible.reduce((sum, o) => sum + o.totalCents, 0);
  const aovCents =
    eligible.length > 0 ? Math.round(revenueCents / eligible.length) : 0;

  const days = buildDayWindow(eligible.length > 0 ? eligible : items);
  const byDay = new Map(days.map((k) => [k, 0]));
  for (const order of eligible) {
    const key = dayKey(order.createdAt);
    if (byDay.has(key)) {
      byDay.set(key, (byDay.get(key) ?? 0) + order.totalCents);
    }
  }

  const revenueBars = days.map((key) => ({
    key,
    label: dayLabel(key),
    value: Math.round((byDay.get(key) ?? 0) / 100),
    active: (byDay.get(key) ?? 0) > 0,
    detail: formatMoneyCents(byDay.get(key) ?? 0, currency),
  }));

  const statusCounts = orders?.statusCounts ?? {};
  const pipelineBars = [
    {
      key: "PAYMENT_PENDING",
      label: "Pay",
      value: statusCounts.PAYMENT_PENDING ?? 0,
      active: (statusCounts.PAYMENT_PENDING ?? 0) > 0,
      detail: "Payment pending",
    },
    {
      key: "AWAITING_CLINICAL_REVIEW",
      label: "Clin",
      value: statusCounts.AWAITING_CLINICAL_REVIEW ?? 0,
      active: (statusCounts.AWAITING_CLINICAL_REVIEW ?? 0) > 0,
      detail: "Clinical review",
    },
    {
      key: "AWAITING_FULFILLMENT",
      label: "Fill",
      value: statusCounts.AWAITING_FULFILLMENT ?? 0,
      active: (statusCounts.AWAITING_FULFILLMENT ?? 0) > 0,
      detail: "Awaiting fulfillment",
    },
    {
      key: "FULFILLED",
      label: "Ship",
      value: statusCounts.FULFILLED ?? 0,
      active: (statusCounts.FULFILLED ?? 0) > 0,
      detail: "Fulfilled",
    },
    {
      key: "CANCELLED",
      label: "Cx",
      value: statusCounts.CANCELLED ?? 0,
      active: false,
      detail: "Cancelled",
    },
    {
      key: "REFUNDED",
      label: "Rf",
      value: statusCounts.REFUNDED ?? 0,
      active: false,
      detail: "Refunded",
    },
  ];

  const fulfilled = statusCounts.FULFILLED ?? 0;
  const openAll = statusCounts.ALL ?? orders?.total ?? 0;
  const fulfillmentRate =
    openAll > 0 ? Math.round((fulfilled / openAll) * 100) : 0;

  return {
    currency,
    revenueCents,
    aovCents,
    sampleSize: items.length,
    catalogTotal: orders?.total ?? 0,
    patientsTotal,
    revenueBars,
    pipelineBars,
    fulfillmentRate,
    fulfilled,
  };
}

function buildDayInsight(orders: OrderListItem[], currency: string) {
  const revenueCents = orders
    .filter(revenueEligible)
    .reduce((sum, o) => sum + o.totalCents, 0);
  const aovCents =
    orders.length > 0
      ? Math.round(
          orders.reduce((sum, o) => sum + o.totalCents, 0) / orders.length,
        )
      : 0;
  const fulfilled = orders.filter((o) => o.status === "FULFILLED").length;
  const pending = orders.filter((o) => o.status === "PAYMENT_PENDING").length;
  const failedish = orders.filter(
    (o) => o.status === "CANCELLED" || o.status === "REFUNDED",
  ).length;
  const top = [...orders]
    .sort((a, b) => b.totalCents - a.totalCents)
    .slice(0, 5);

  return {
    count: orders.length,
    revenueCents,
    aovCents,
    currency,
    fulfilled,
    pending,
    failedish,
    top,
  };
}

type Resource<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
};

type CrmDashboardInsightsProps = {
  orders: Resource<OrderListResponse>;
  renewals: Resource<OrderListResponse>;
  patientsTotal: number;
  canViewOrders: boolean;
};

/**
 * CRM Insights face — live order + renewal economics for care-commerce teams.
 */
export function CrmDashboardInsights({
  orders,
  renewals,
  patientsTotal,
  canViewOrders,
}: CrmDashboardInsightsProps) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const renewalItems = useMemo(
    () => renewals.data?.items ?? [],
    [renewals.data?.items],
  );
  const { days, map: renewalsByDay } = useMemo(
    () => groupRenewalsByDay(renewalItems),
    [renewalItems],
  );

  const renewalBars = useMemo(() => {
    return days.map((key) => {
      const list = renewalsByDay.get(key) ?? [];
      const revenue = list.reduce((sum, o) => sum + o.totalCents, 0);
      const currency = list[0]?.currency ?? "USD";
      return {
        key,
        label: dayLabel(key),
        value: list.length,
        active: list.length > 0,
        detail: `${formatMoneyCents(revenue, currency)} revenue`,
      };
    });
  }, [days, renewalsByDay]);

  const scopedRenewals = useMemo(() => {
    if (!selectedDay) return renewalItems;
    return renewalsByDay.get(selectedDay) ?? [];
  }, [renewalItems, renewalsByDay, selectedDay]);

  const dayInsight = useMemo(() => {
    const currency =
      scopedRenewals[0]?.currency ?? renewalItems[0]?.currency ?? "USD";
    return buildDayInsight(scopedRenewals, currency);
  }, [scopedRenewals, renewalItems]);

  if (!canViewOrders) {
    return (
      <EmptyState
        icon={<TrendingUp />}
        title="Insights need order access"
        description="Your role can open the CRM workspace, but order analytics are not assigned."
      />
    );
  }

  if ((orders.loading || renewals.loading) && !orders.data && !renewals.data) {
    return <PageSkeleton />;
  }

  if (orders.error && !orders.data) {
    return (
      <ErrorState title="Unable to load insights" onRetry={orders.retry}>
        {orders.error}
      </ErrorState>
    );
  }

  const metrics = buildCrmInsightMetrics(orders.data, patientsTotal);
  const scopeLabel = selectedDay ? dayTitle(selectedDay) : "All sample days";

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <InsightStat
          icon={CircleDollarSign}
          label={selectedDay ? "Day revenue" : "Sample revenue"}
          value={formatMoneyCents(
            selectedDay ? dayInsight.revenueCents : metrics.revenueCents,
            selectedDay ? dayInsight.currency : metrics.currency,
          )}
          hint={
            selectedDay
              ? `Renewals on ${dayLabel(selectedDay)}`
              : `From ${metrics.sampleSize} recent orders`
          }
          tone="gold"
        />
        <InsightStat
          icon={Banknote}
          label={selectedDay ? "Day AOV" : "Avg order value"}
          value={formatMoneyCents(
            selectedDay ? dayInsight.aovCents : metrics.aovCents,
            selectedDay ? dayInsight.currency : metrics.currency,
          )}
          hint={selectedDay ? scopeLabel : "Eligible paid pipeline"}
        />
        <InsightStat
          icon={RefreshCw}
          label={selectedDay ? "Day renewals" : "Renewals in sample"}
          value={selectedDay ? dayInsight.count : renewalItems.length}
          hint={
            selectedDay
              ? `${dayInsight.fulfilled} fulfilled`
              : `${renewals.data?.total ?? renewalItems.length} catalog total`
          }
        />
        <InsightStat
          icon={selectedDay ? Package : TrendingUp}
          label={selectedDay ? "Pending renewals" : "Patients"}
          value={selectedDay ? dayInsight.pending : metrics.patientsTotal}
          hint={
            selectedDay ? "Payment pending that day" : "CRM patient records"
          }
        />
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
        <SoftCard className="lg:col-span-7">
          <SoftCardHeader
            title="Revenue by day"
            href="/crm/orders"
            meta="7-day window · live order totals"
          />
          <SoftBarChart
            bars={metrics.revenueBars}
            loading={orders.loading}
            valueFormatter={(v) => `$${v}`}
          />
          <p className="mt-3 text-xs text-[#8a857a] dark:text-white/40">
            Hover a bar for dollar totals. Excludes drafts and cancelled orders.
          </p>
        </SoftCard>

        <SoftCard className="lg:col-span-5">
          <SoftCardHeader
            title="Fulfillment share"
            href="/crm/orders?status=FULFILLED"
            meta="Of all tracked orders"
          />
          <SoftRingStat
            label="Fulfilled"
            valueLabel={`${metrics.fulfillmentRate}%`}
            percent={metrics.fulfillmentRate}
            loading={orders.loading}
          />
        </SoftCard>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
        <SoftCard className="lg:col-span-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight">
                Renewals created each day
              </h2>
              <p className="mt-0.5 text-sm opacity-60">
                Live subscription renewal orders · click a day to filter
              </p>
            </div>
            {selectedDay ? (
              <button
                type="button"
                onClick={() => setSelectedDay(null)}
                className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-[#1c1c1c] transition-colors hover:bg-black/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
              >
                Clear day
              </button>
            ) : null}
          </div>
          {renewals.error && !renewals.data ? (
            <ErrorState onRetry={renewals.retry}>{renewals.error}</ErrorState>
          ) : (
            <SoftBarChart
              bars={renewalBars}
              loading={renewals.loading}
              selectedKey={selectedDay}
              onBarClick={(key) =>
                setSelectedDay((current) => (current === key ? null : key))
              }
              valueFormatter={(v) => `${v} renewal${v === 1 ? "" : "s"}`}
            />
          )}
          <p className="mt-3 text-xs text-[#8a857a] dark:text-white/40">
            Hover for count + revenue. Click again to clear the day filter.
          </p>
        </SoftCard>

        <SoftCard className="lg:col-span-3" tone="accent">
          <SoftCardHeader
            title={selectedDay ? "Selected day" : "Renewal mix"}
            meta={selectedDay ? dayTitle(selectedDay) : "Across sample window"}
          />
          <div className="mt-4 space-y-4">
            <div>
              <p className="text-3xl font-semibold tabular-nums tracking-tight">
                {dayInsight.count}
              </p>
              <p className="text-sm opacity-70">
                {selectedDay ? "Renewals that day" : "Renewals in window"}
              </p>
            </div>
            <div className="space-y-2 text-sm">
              <MixRow label="Fulfilled" value={dayInsight.fulfilled} />
              <MixRow label="Payment pending" value={dayInsight.pending} />
              <MixRow label="Cancelled / refunded" value={dayInsight.failedish} />
            </div>
            <div className="rounded-2xl bg-black/5 px-3 py-2 dark:bg-black/20">
              <p className="text-[0.65rem] font-medium tracking-wide uppercase opacity-70">
                Revenue
              </p>
              <p className="text-lg font-semibold tabular-nums">
                {formatMoneyCents(dayInsight.revenueCents, dayInsight.currency)}
              </p>
            </div>
          </div>
        </SoftCard>

        <SoftCard className="lg:col-span-4" tone="dark">
          <SoftCardHeader
            title={selectedDay ? "Day renewals" : "Top renewals"}
            meta={selectedDay ? dayLabel(selectedDay) : "In current sample"}
          />
          {dayInsight.top.length === 0 ? (
            <p className="text-sm text-white/45">
              {selectedDay
                ? "No renewals created on this day."
                : "No renewal orders in sample."}
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {dayInsight.top.map((order) => (
                <li key={order.id}>
                  <Link
                    href={`/crm/orders/${order.id}`}
                    className="flex items-center justify-between gap-3 rounded-2xl px-2.5 py-2.5 transition-colors hover:bg-white/6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#efd56a]/50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {order.orderNumber}
                      </span>
                      <span className="block truncate text-xs text-white/40">
                        {order.status.replaceAll("_", " ")}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-[#efd56a]">
                      {formatMoneyCents(order.totalCents, order.currency)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SoftCard>
      </div>
    </div>
  );
}

function InsightStat({
  icon: Icon,
  label,
  value,
  hint,
  tone = "light",
}: {
  icon: typeof TrendingUp;
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "light" | "gold";
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-[1.5rem] px-4 py-3 ring-1",
        tone === "gold"
          ? "bg-[linear-gradient(160deg,#f6e7a8_0%,#efd56a_55%,#e6c44a_100%)] text-[#1c1c1c] ring-black/5 dark:bg-[linear-gradient(160deg,#3a3418_0%,#5a4d1e_55%,#7a6820_100%)] dark:text-[#f7f1d8] dark:ring-white/10"
          : "bg-white/85 ring-black/5 dark:bg-white/8 dark:ring-white/10",
      )}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#1c1c1c] text-white dark:bg-[#efd56a] dark:text-[#1c1c1c]">
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 leading-tight">
        <p
          className={cn(
            "text-[0.65rem] font-medium tracking-wide uppercase",
            tone === "gold"
              ? "opacity-70"
              : "text-[#8a857a] dark:text-white/45",
          )}
        >
          {label}
        </p>
        <p className="truncate text-lg font-semibold tabular-nums">{value}</p>
        {hint ? (
          <p
            className={cn(
              "truncate text-[0.7rem]",
              tone === "gold"
                ? "opacity-60"
                : "text-[#8a857a] dark:text-white/40",
            )}
          >
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function MixRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-full bg-black/5 px-3 py-1.5 dark:bg-black/20">
      <span className="text-sm opacity-80">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}
