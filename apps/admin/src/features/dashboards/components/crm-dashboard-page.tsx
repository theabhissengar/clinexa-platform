"use client";

import {
  Activity,
  AlertTriangle,
  Repeat,
  ShoppingCart,
  Truck,
  Users,
} from "lucide-react";
import Link from "next/link";

import {
  ClinexaPage,
  DataTable,
  EmptyState,
  ErrorState,
  MetricCard,
  PageBody,
  PageCanvas,
  PageHeader,
  PageHeaderCopy,
  PageHeaderDescription,
  PageHeaderTitle,
  PageSkeleton,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/patterns";
import { StatusBadge } from "@/components/ui/status-badge";
import { customerLabel, formatDateTime } from "@/features/orders/lib/format";
import {
  customerLabel as subscriptionCustomerLabel,
  formatDateTime as formatSubscriptionDate,
} from "@/features/subscriptions/lib/format";

import { DashboardMetricGrid } from "./dashboard-metric-grid";
import { DashboardSectionCard } from "./dashboard-section-card";
import {
  DashboardShortcuts,
  type DashboardShortcut,
} from "./dashboard-shortcuts";
import { useCrmDashboardData } from "../hooks/use-crm-dashboard-data";

export function CrmDashboardPage() {
  const dashboard = useCrmDashboardData();
  const { permissions, orders, subscriptions, patients } = dashboard;
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

  const shortcuts: DashboardShortcut[] = [
    ...(permissions.canViewPatients
      ? [{ label: "Users", href: "/crm/users", icon: Users }]
      : []),
    ...(permissions.canViewOrders
      ? [{ label: "Orders", href: "/crm/orders", icon: ShoppingCart }]
      : []),
    ...(permissions.canViewSubscriptions
      ? [{ label: "Subscriptions", href: "/crm/subscriptions", icon: Repeat }]
      : []),
  ];

  const orderCounts = orders.data?.statusCounts;
  const subscriptionCounts = subscriptions.data?.response.statusCounts;

  return (
    <PageCanvas>
      <ClinexaPage width="wide">
        {isFirstLoad ? (
          <PageSkeleton />
        ) : (
          <PageBody>
            <PageHeader>
              <PageHeaderCopy>
                <PageHeaderTitle>Dashboard</PageHeaderTitle>
                <PageHeaderDescription>
                  Operational queues and recent care-commerce activity.
                </PageHeaderDescription>
              </PageHeaderCopy>
            </PageHeader>

            {!hasWidgets ? (
              <EmptyState
                icon={<Activity />}
                title="No operational widgets available"
                description="Your account can access the CRM workspace, but no dashboard business modules are assigned."
              />
            ) : (
              <>
                <DashboardMetricGrid>
                  {permissions.canViewOrders ? (
                    <>
                      <MetricCard
                        label="Clinical review"
                        value={orderCounts?.AWAITING_CLINICAL_REVIEW}
                        hint="Order-status queue"
                        icon={<Activity />}
                        href="/crm/orders?status=AWAITING_CLINICAL_REVIEW"
                        tone={
                          (orderCounts?.AWAITING_CLINICAL_REVIEW ?? 0) > 0
                            ? "warning"
                            : "neutral"
                        }
                        loading={orders.loading}
                      />
                      <MetricCard
                        label="Awaiting fulfillment"
                        value={orderCounts?.AWAITING_FULFILLMENT}
                        hint="Orders ready for operations"
                        icon={<Truck />}
                        href="/crm/orders?status=AWAITING_FULFILLMENT"
                        tone={
                          (orderCounts?.AWAITING_FULFILLMENT ?? 0) > 0
                            ? "warning"
                            : "neutral"
                        }
                        loading={orders.loading}
                      />
                      <MetricCard
                        label="Open orders"
                        value={orderCounts?.ALL}
                        hint="All current orders"
                        icon={<ShoppingCart />}
                        href="/crm/orders"
                        loading={orders.loading}
                      />
                    </>
                  ) : null}
                  {permissions.canViewSubscriptions ? (
                    <>
                      <MetricCard
                        label="Past due"
                        value={subscriptionCounts?.PAST_DUE}
                        hint="Subscriptions needing attention"
                        icon={<AlertTriangle />}
                        href="/crm/subscriptions?status=PAST_DUE"
                        tone={
                          (subscriptionCounts?.PAST_DUE ?? 0) > 0
                            ? "warning"
                            : "neutral"
                        }
                        loading={subscriptions.loading}
                      />
                      <MetricCard
                        label="Active subscriptions"
                        value={subscriptionCounts?.ACTIVE}
                        hint="Current active plans"
                        icon={<Repeat />}
                        href="/crm/subscriptions?status=ACTIVE"
                        loading={subscriptions.loading}
                      />
                    </>
                  ) : null}
                  {permissions.canViewPatients ? (
                    <MetricCard
                      label="Patients"
                      value={patients.data?.total}
                      hint="CRM patient records"
                      icon={<Users />}
                      href="/crm/users"
                      loading={patients.loading}
                    />
                  ) : null}
                </DashboardMetricGrid>

                {patients.error ? (
                  <ErrorState
                    title="Unable to load patient total"
                    onRetry={patients.retry}
                  >
                    {patients.error}
                  </ErrorState>
                ) : null}

                <div className="grid min-w-0 gap-6 lg:grid-cols-2">
                  {permissions.canViewOrders ? (
                    <DashboardSectionCard
                      title="Recent orders"
                      description="The latest operational order activity."
                      href="/crm/orders"
                    >
                      <DataTable
                        density="dense"
                        loading={orders.loading}
                        empty={(orders.data?.items.length ?? 0) === 0}
                        error={
                          orders.error ? (
                            <ErrorState onRetry={orders.retry}>
                              {orders.error}
                            </ErrorState>
                          ) : undefined
                        }
                        emptyState={
                          <EmptyState
                            icon={<ShoppingCart />}
                            title="No orders yet"
                            description="Recent orders will appear here."
                          />
                        }
                      >
                        <TableHeader>
                          <TableRow>
                            <TableHead>Order</TableHead>
                            <TableHead className="hidden sm:table-cell">
                              Patient
                            </TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Date</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {orders.data?.items.map((order) => (
                            <TableRow key={order.id}>
                              <TableCell>
                                <Link
                                  href={`/crm/orders/${order.id}`}
                                  className="font-medium text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                  {order.orderNumber}
                                </Link>
                              </TableCell>
                              <TableCell className="hidden max-w-40 truncate sm:table-cell">
                                {customerLabel(order)}
                              </TableCell>
                              <TableCell>
                                <StatusBadge status={order.status} />
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-muted-foreground">
                                {formatDateTime(order.createdAt)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </DataTable>
                    </DashboardSectionCard>
                  ) : null}

                  {permissions.canViewSubscriptions ? (
                    <DashboardSectionCard
                      title="Subscriptions needing attention"
                      description={
                        subscriptions.data?.mode === "due-soon"
                          ? "Renewals due in the next seven days."
                          : "Past-due subscriptions requiring follow-up."
                      }
                      href="/crm/subscriptions"
                    >
                      <DataTable
                        density="dense"
                        loading={subscriptions.loading}
                        empty={
                          (subscriptions.data?.response.items.length ?? 0) === 0
                        }
                        error={
                          subscriptions.error ? (
                            <ErrorState onRetry={subscriptions.retry}>
                              {subscriptions.error}
                            </ErrorState>
                          ) : undefined
                        }
                        emptyState={
                          <EmptyState
                            icon={<Repeat />}
                            title="No subscription attention needed"
                            description="There are no past-due or due-soon subscriptions."
                          />
                        }
                      >
                        <TableHeader>
                          <TableRow>
                            <TableHead>Subscription</TableHead>
                            <TableHead className="hidden sm:table-cell">
                              Patient
                            </TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Next renewal</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {subscriptions.data?.response.items.map(
                            (subscription) => (
                              <TableRow key={subscription.id}>
                                <TableCell>
                                  <Link
                                    href={`/crm/subscriptions/${subscription.id}`}
                                    className="font-medium text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  >
                                    {subscription.subscriptionNumber ??
                                      subscription.id}
                                  </Link>
                                </TableCell>
                                <TableCell className="hidden max-w-40 truncate sm:table-cell">
                                  {subscriptionCustomerLabel(subscription)}
                                </TableCell>
                                <TableCell>
                                  <StatusBadge
                                    status={subscription.status}
                                  />
                                </TableCell>
                                <TableCell className="whitespace-nowrap text-muted-foreground">
                                  {formatSubscriptionDate(
                                    subscription.nextRenewalAt,
                                  )}
                                </TableCell>
                              </TableRow>
                            ),
                          )}
                        </TableBody>
                      </DataTable>
                    </DashboardSectionCard>
                  ) : null}
                </div>

                <DashboardShortcuts items={shortcuts} />
              </>
            )}
          </PageBody>
        )}
      </ClinexaPage>
    </PageCanvas>
  );
}
