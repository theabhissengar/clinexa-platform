"use client";

import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  ChartNoAxesCombined,
  LayoutDashboard,
  Repeat,
  ShoppingCart,
  Truck,
  Users,
} from "lucide-react";
import Link from "next/link";

import {
  EmptyState,
  ErrorState,
  PageSkeleton,
} from "@/components/patterns";
import { StatusBadge } from "@/components/ui/status-badge";
import { customerLabel, formatDateTime } from "@/features/orders/lib/format";
import {
  customerLabel as subscriptionCustomerLabel,
  formatDateTime as formatSubscriptionDate,
} from "@/features/subscriptions/lib/format";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";

import { CrmDashboardInsights } from "./crm-dashboard-insights";
import {
  SoftBarChart,
  SoftCard,
  SoftCardHeader,
  SoftDashboardShell,
  SoftLinkRow,
  SoftProgressRow,
  SoftRingStat,
  SoftTaskList,
  SoftWelcome,
  greetingNameFromEmail,
} from "./soft-dashboard";
import { useCrmDashboardData } from "../hooks/use-crm-dashboard-data";

export function CrmDashboardPage() {
  const { user } = useAuth();
  const dashboard = useCrmDashboardData();
  const { permissions, orders, renewals, subscriptions, patients } = dashboard;
  const [showInsights, setShowInsights] = useState(false);

  const hasWidgets =
    permissions.canViewOrders ||
    permissions.canViewSubscriptions ||
    permissions.canViewPatients;
  const hasResolvedData =
    orders.data !== null ||
    subscriptions.data !== null ||
    patients.data !== null;
  const isFirstLoad =
    hasWidgets &&
    !hasResolvedData &&
    (orders.loading || subscriptions.loading || patients.loading);

  const orderCounts = orders.data?.statusCounts;
  const subscriptionCounts = subscriptions.data?.response.statusCounts;
  const openOrders = orderCounts?.ALL ?? 0;
  const clinical = orderCounts?.AWAITING_CLINICAL_REVIEW ?? 0;
  const fulfillment = orderCounts?.AWAITING_FULFILLMENT ?? 0;
  const pastDue = subscriptionCounts?.PAST_DUE ?? 0;
  const activeSubs = subscriptionCounts?.ACTIVE ?? 0;
  const patientsTotal = patients.data?.total ?? 0;

  const fulfillmentRate =
    openOrders > 0 ? Math.round((fulfillment / openOrders) * 100) : 0;

  const activityBars = [
    { label: "Clin", value: clinical, active: clinical > 0 },
    { label: "Fill", value: fulfillment, active: fulfillment > 0 },
    {
      label: "Open",
      value: openOrders,
      active: false,
    },
    { label: "Due", value: pastDue, active: pastDue > 0 },
    { label: "Live", value: activeSubs, active: activeSubs > 0 },
    {
      label: "Idle",
      value: Math.max(0, openOrders - clinical - fulfillment),
      active: false,
    },
    {
      label: "Hot",
      value: clinical + fulfillment + pastDue,
      active: clinical + fulfillment + pastDue > 0,
    },
  ];

  const attentionTasks = [
    ...(permissions.canViewOrders && clinical > 0
      ? [
          {
            id: "clinical",
            label: "Clinical review queue",
            hint: `${clinical} order${clinical === 1 ? "" : "s"} waiting`,
            href: "/crm/orders?status=AWAITING_CLINICAL_REVIEW",
            done: false,
          },
        ]
      : []),
    ...(permissions.canViewOrders && fulfillment > 0
      ? [
          {
            id: "fulfillment",
            label: "Awaiting fulfillment",
            hint: `${fulfillment} ready for ops`,
            href: "/crm/orders?status=AWAITING_FULFILLMENT",
            done: false,
          },
        ]
      : []),
    ...(permissions.canViewSubscriptions && pastDue > 0
      ? [
          {
            id: "past-due",
            label: "Past-due subscriptions",
            hint: `${pastDue} need follow-up`,
            href: "/crm/subscriptions?status=PAST_DUE",
            done: false,
          },
        ]
      : []),
    ...(permissions.canViewOrders && clinical === 0
      ? [
          {
            id: "clinical-clear",
            label: "Clinical review clear",
            hint: "No orders waiting",
            href: "/crm/orders",
            done: true,
          },
        ]
      : []),
  ].slice(0, 6);

  const recentOrderLinks =
    orders.data?.items.slice(0, 5).map((order) => ({
      label: order.orderNumber,
      description: `${customerLabel(order)} · ${formatDateTime(order.createdAt)}`,
      href: `/crm/orders/${order.id}`,
      badge: order.status.replaceAll("_", " "),
    })) ?? [];

  const attentionLinks =
    subscriptions.data?.response.items.slice(0, 5).map((sub) => ({
      label: subscriptionCustomerLabel(sub),
      description: `Renewal ${formatSubscriptionDate(sub.nextRenewalAt)}`,
      href: `/crm/subscriptions/${sub.id}`,
      badge: sub.status.replaceAll("_", " "),
    })) ?? [];

  return (
    <SoftDashboardShell>
      {isFirstLoad ? (
        <PageSkeleton />
      ) : !hasWidgets ? (
        <EmptyState
          icon={<Activity />}
          title="No operational widgets available"
          description="Your account can access the CRM workspace, but no dashboard business modules are assigned."
        />
      ) : (
        <>
          <SoftWelcome
            title={`Welcome in, ${greetingNameFromEmail(user?.email)}`}
            subtitle={
              showInsights
                ? "Revenue and pipeline insights from live CRM orders."
                : "Operational queues and recent care-commerce activity."
            }
            stats={[
              ...(permissions.canViewPatients
                ? [
                    {
                      label: "Patients",
                      value: patientsTotal,
                      icon: Users,
                      loading: patients.loading,
                    },
                  ]
                : []),
              ...(permissions.canViewOrders
                ? [
                    {
                      label: "Open orders",
                      value: openOrders,
                      icon: ShoppingCart,
                      loading: orders.loading,
                    },
                  ]
                : []),
              ...(permissions.canViewSubscriptions
                ? [
                    {
                      label: "Active plans",
                      value: activeSubs,
                      icon: Repeat,
                      loading: subscriptions.loading,
                    },
                  ]
                : []),
            ]}
            action={
              <button
                type="button"
                aria-pressed={showInsights}
                aria-label={
                  showInsights
                    ? "Show operations dashboard"
                    : "Show insights dashboard"
                }
                onClick={() => setShowInsights((v) => !v)}
                className={cn(
                  "inline-flex h-13 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-semibold tracking-tight transition-[background-color,color,box-shadow] duration-300 ease-out",
                  "ring-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1c1c1c]/35 dark:focus-visible:ring-[#efd56a]/45",
                  showInsights
                    ? "bg-[#1c1c1c] text-white ring-black/20 shadow-[0_10px_24px_-12px_rgba(0,0,0,0.55)] dark:bg-[#efd56a] dark:text-[#1c1c1c] dark:ring-transparent"
                    : "bg-white/85 text-[#1c1c1c] ring-black/5 hover:bg-white dark:bg-white/8 dark:text-white dark:ring-white/10 dark:hover:bg-white/12",
                )}
              >
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full",
                    showInsights
                      ? "bg-[#efd56a] text-[#1c1c1c] dark:bg-[#1c1c1c] dark:text-[#efd56a]"
                      : "bg-[#1c1c1c] text-white dark:bg-[#efd56a] dark:text-[#1c1c1c]",
                  )}
                >
                  {showInsights ? (
                    <LayoutDashboard className="size-3.5" aria-hidden />
                  ) : (
                    <ChartNoAxesCombined className="size-3.5" aria-hidden />
                  )}
                </span>
                {/* Stack both labels so button width never changes between states */}
                <span className="relative inline-grid place-items-center pr-1">
                  <span
                    className={cn(
                      "col-start-1 row-start-1",
                      showInsights && "invisible",
                    )}
                  >
                    Insights
                  </span>
                  <span
                    className={cn(
                      "col-start-1 row-start-1",
                      !showInsights && "invisible",
                    )}
                  >
                    Ops view
                  </span>
                </span>
              </button>
            }
          />

          <div className="dashboard-flip-stage min-w-0">
            <div
              className={cn(
                "dashboard-flip-sheet",
                showInsights && "is-flipped",
              )}
            >
              <div
                className={cn(
                  "dashboard-flip-face flex flex-col gap-4 sm:gap-5",
                  showInsights && "pointer-events-none",
                )}
                aria-hidden={showInsights}
                inert={showInsights ? true : undefined}
              >
                {permissions.canViewOrders ||
                permissions.canViewSubscriptions ? (
                  <SoftProgressRow
                    items={[
                      ...(permissions.canViewOrders
                        ? [
                            {
                              label: "Clinical review",
                              value: clinical,
                              max: Math.max(openOrders, clinical, 1),
                              tone: "ink" as const,
                              href: "/crm/orders?status=AWAITING_CLINICAL_REVIEW",
                            },
                            {
                              label: "Fulfillment",
                              value: fulfillment,
                              max: Math.max(openOrders, fulfillment, 1),
                              tone: "gold" as const,
                              href: "/crm/orders?status=AWAITING_FULFILLMENT",
                            },
                          ]
                        : []),
                      ...(permissions.canViewSubscriptions
                        ? [
                            {
                              label: "Past due",
                              value: pastDue,
                              max: Math.max(activeSubs + pastDue, pastDue, 1),
                              tone: "ghost" as const,
                              href: "/crm/subscriptions?status=PAST_DUE",
                            },
                            {
                              label: "Active plans",
                              value: activeSubs,
                              max: Math.max(
                                activeSubs + pastDue,
                                activeSubs,
                                1,
                              ),
                              tone: "ghost" as const,
                              href: "/crm/subscriptions?status=ACTIVE",
                            },
                          ]
                        : []),
                    ]}
                  />
                ) : null}

                {patients.error ? (
                  <ErrorState
                    title="Unable to load patient total"
                    onRetry={patients.retry}
                  >
                    {patients.error}
                  </ErrorState>
                ) : null}

                <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
                  <SoftCard className="lg:col-span-3" tone="accent">
                    <SoftCardHeader
                      title="Priority queue"
                      href={
                        clinical > 0
                          ? "/crm/orders?status=AWAITING_CLINICAL_REVIEW"
                          : fulfillment > 0
                            ? "/crm/orders?status=AWAITING_FULFILLMENT"
                            : "/crm/orders"
                      }
                      meta="What needs eyes first"
                    />
                    <div className="mt-6 space-y-4">
                      <div className="flex items-center gap-3">
                        <span className="flex size-11 items-center justify-center rounded-2xl bg-[#1c1c1c] text-white dark:bg-[#1c1c1c]">
                          {clinical > 0 ? (
                            <Activity className="size-5" aria-hidden />
                          ) : (
                            <Truck className="size-5" aria-hidden />
                          )}
                        </span>
                        <div>
                          <p className="text-3xl font-semibold tabular-nums tracking-tight">
                            {clinical > 0 ? clinical : fulfillment}
                          </p>
                          <p className="text-sm opacity-70">
                            {clinical > 0
                              ? "Clinical reviews"
                              : "Ready to fulfill"}
                          </p>
                        </div>
                      </div>
                      <p className="text-sm leading-relaxed opacity-75">
                        Keep operational queues moving — jump straight into the
                        hottest CRM workstream.
                      </p>
                    </div>
                  </SoftCard>

                  <SoftCard className="lg:col-span-4">
                    <SoftCardHeader
                      title="Ops pulse"
                      href="/crm/orders"
                      meta="Queue mix across CRM modules"
                    />
                    <SoftBarChart
                      bars={activityBars}
                      loading={orders.loading || subscriptions.loading}
                    />
                  </SoftCard>

                  <SoftCard className="lg:col-span-2">
                    <SoftCardHeader title="Fulfillment" href="/crm/orders" />
                    <SoftRingStat
                      label="Share of open orders"
                      valueLabel={`${fulfillment}`}
                      percent={fulfillmentRate}
                      loading={orders.loading}
                    />
                  </SoftCard>

                  <div className="lg:col-span-3">
                    <SoftTaskList
                      title="Attention board"
                      meta={`${attentionTasks.filter((t) => !t.done).length} open`}
                      items={attentionTasks}
                      empty="Queues look calm right now."
                    />
                  </div>
                </div>

                <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
                  {permissions.canViewOrders ? (
                    <SoftCard>
                      <SoftCardHeader
                        title="Recent orders"
                        href="/crm/orders"
                        meta="Latest operational activity"
                      />
                      {orders.error ? (
                        <ErrorState onRetry={orders.retry}>
                          {orders.error}
                        </ErrorState>
                      ) : orders.loading ? (
                        <PageSkeleton />
                      ) : recentOrderLinks.length === 0 ? (
                        <EmptyState
                          icon={<ShoppingCart />}
                          title="No orders yet"
                          description="Recent orders will appear here."
                        />
                      ) : (
                        <SoftLinkRow items={recentOrderLinks} />
                      )}
                    </SoftCard>
                  ) : null}

                  {permissions.canViewSubscriptions ? (
                    <SoftCard>
                      <SoftCardHeader
                        title={
                          subscriptions.data?.mode === "due-soon"
                            ? "Renewals due soon"
                            : "Subscriptions needing attention"
                        }
                        href="/crm/subscriptions"
                        meta={
                          subscriptions.data?.mode === "due-soon"
                            ? "Next seven days"
                            : "Past-due follow-up"
                        }
                      />
                      {subscriptions.error ? (
                        <ErrorState onRetry={subscriptions.retry}>
                          {subscriptions.error}
                        </ErrorState>
                      ) : subscriptions.loading ? (
                        <PageSkeleton />
                      ) : attentionLinks.length === 0 ? (
                        <EmptyState
                          icon={<AlertTriangle />}
                          title="Nothing urgent"
                          description="No past-due or soon-due subscriptions right now."
                        />
                      ) : (
                        <SoftLinkRow items={attentionLinks} />
                      )}
                      {subscriptions.data?.response.items[0] ? (
                        <div className="mt-3 flex items-center gap-2 rounded-2xl bg-black/[0.03] px-3 py-2 dark:bg-white/[0.04]">
                          <StatusBadge
                            status={
                              subscriptions.data.response.items[0].status
                            }
                          />
                          <Link
                            href={`/crm/subscriptions/${subscriptions.data.response.items[0].id}`}
                            className="truncate text-sm font-medium text-[#1c1c1c] hover:underline dark:text-white"
                          >
                            {subscriptionCustomerLabel(
                              subscriptions.data.response.items[0],
                            )}
                          </Link>
                        </div>
                      ) : null}
                    </SoftCard>
                  ) : null}
                </div>
              </div>

              <div
                className={cn(
                  "dashboard-flip-face dashboard-flip-face-back",
                  !showInsights && "pointer-events-none",
                )}
                aria-hidden={!showInsights}
                inert={!showInsights ? true : undefined}
              >
                <CrmDashboardInsights
                  orders={orders}
                  renewals={renewals}
                  patientsTotal={patientsTotal}
                  canViewOrders={permissions.canViewOrders}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </SoftDashboardShell>
  );
}
