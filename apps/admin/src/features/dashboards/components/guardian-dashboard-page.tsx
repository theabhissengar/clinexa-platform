"use client";

import {
  Boxes,
  Package,
  Repeat,
  ShoppingCart,
  Users,
  Warehouse,
} from "lucide-react";
import Link from "next/link";

import {
  EmptyState,
  ErrorState,
  PageSkeleton,
} from "@/components/patterns";
import { StatusBadge } from "@/components/ui/status-badge";
import { customerLabel, formatDateTime } from "@/features/orders/lib/format";
import { useAuth } from "@/providers/auth-provider";

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
import { useGuardianDashboardData } from "../hooks/use-guardian-dashboard-data";

export function GuardianDashboardPage() {
  const { user } = useAuth();
  const dashboard = useGuardianDashboardData();
  const {
    permissions,
    products,
    inventory,
    users,
    orders,
    subscriptions,
  } = dashboard;
  const hasWidgets = Object.values(permissions).some(Boolean);
  const hasResolvedData = [
    products.data,
    inventory.data,
    users.data,
    orders.data,
    subscriptions.data,
  ].some((value) => value !== null);
  const isFirstLoad =
    hasWidgets &&
    !hasResolvedData &&
    [
      products.loading,
      inventory.loading,
      users.loading,
      orders.loading,
      subscriptions.loading,
    ].some(Boolean);

  const productCounts = products.data?.statusCounts;
  const subscriptionCounts = subscriptions.data?.statusCounts;
  const userCounts = users.data?.statusCounts;

  const published = productCounts?.PUBLISHED ?? 0;
  const inReview = productCounts?.REVIEW ?? 0;
  const draft = productCounts?.DRAFT ?? 0;
  const catalogTotal = Math.max(published + inReview + draft, 1);
  const lowStock = inventory.data?.lowStockCount ?? 0;
  const onHand = inventory.data?.onHandTotal ?? 0;
  const reserved = inventory.data?.reservedTotal ?? 0;
  const pendingRes = inventory.data?.pendingReservations ?? 0;
  const usersTotal = users.data?.total ?? 0;
  const pendingUsers = userCounts?.PENDING_VERIFICATION ?? 0;
  const activeSubs = subscriptionCounts?.ACTIVE ?? 0;
  const ordersTotal = orders.data?.statusCounts.ALL ?? 0;

  const publishedShare = Math.round((published / catalogTotal) * 100);

  const inventoryBars = [
    { label: "Hand", value: onHand, active: false },
    { label: "Rsvd", value: reserved, active: false },
    { label: "Low", value: lowStock, active: lowStock > 0 },
    { label: "Pend", value: pendingRes, active: pendingRes > 0 },
    { label: "Pub", value: published, active: true },
    { label: "Rev", value: inReview, active: inReview > 0 },
    { label: "Drf", value: draft, active: false },
  ];

  const governanceTasks = [
    ...(permissions.canViewProducts && inReview > 0
      ? [
          {
            id: "review",
            label: "Catalog in review",
            hint: `${inReview} product${inReview === 1 ? "" : "s"}`,
            href: "/guardian/products?status=REVIEW",
            done: false,
          },
        ]
      : []),
    ...(permissions.canViewInventory && lowStock > 0
      ? [
          {
            id: "low-stock",
            label: "Low stock SKUs",
            hint: `${lowStock} below threshold`,
            href: "/guardian/inventory/stock?lowStockOnly=true",
            done: false,
          },
        ]
      : []),
    ...(permissions.canViewUsers && pendingUsers > 0
      ? [
          {
            id: "pending-users",
            label: "Pending verification",
            hint: `${pendingUsers} account${pendingUsers === 1 ? "" : "s"}`,
            href: "/guardian/users?status=PENDING_VERIFICATION",
            done: false,
          },
        ]
      : []),
    ...(permissions.canViewProducts && draft > 0
      ? [
          {
            id: "drafts",
            label: "Draft products",
            hint: `${draft} unpublished`,
            href: "/guardian/products?status=DRAFT",
            done: false,
          },
        ]
      : []),
    ...(permissions.canViewProducts && inReview === 0
      ? [
          {
            id: "review-clear",
            label: "Review queue clear",
            hint: "No products waiting",
            href: "/guardian/products",
            done: true,
          },
        ]
      : []),
  ].slice(0, 6);

  const productLinks =
    products.data?.items.slice(0, 6).map((product) => ({
      label: product.name,
      description: formatDateTime(product.updatedAt),
      href: `/guardian/products/${product.id}`,
      badge:
        product.lifecycleStatus === "UNPUBLISHED"
          ? "Private"
          : product.lifecycleStatus,
    })) ?? [];

  const orderLinks =
    orders.data?.items.slice(0, 5).map((order) => ({
      label: order.orderNumber,
      description: `${customerLabel(order)} · ${formatDateTime(order.createdAt)}`,
      href: `/guardian/orders/${order.id}`,
      badge: order.status.replaceAll("_", " "),
    })) ?? [];

  return (
    <SoftDashboardShell>
      {isFirstLoad ? (
        <PageSkeleton />
      ) : !hasWidgets ? (
        <EmptyState
          icon={<Boxes />}
          title="No administrative widgets available"
          description="Your account can access Guardian, but no dashboard business modules are assigned."
        />
      ) : (
        <>
          <SoftWelcome
            title={`Welcome in, ${greetingNameFromEmail(user?.email)}`}
            subtitle="Administrative health across catalog, inventory, users, and commerce."
            stats={[
              ...(permissions.canViewProducts
                ? [
                    {
                      label: "Published",
                      value: published,
                      icon: Package,
                      loading: products.loading,
                    },
                  ]
                : []),
              ...(permissions.canViewUsers
                ? [
                    {
                      label: "Users",
                      value: usersTotal,
                      icon: Users,
                      loading: users.loading,
                    },
                  ]
                : []),
              ...(permissions.canViewOrders
                ? [
                    {
                      label: "Orders",
                      value: ordersTotal,
                      icon: ShoppingCart,
                      loading: orders.loading,
                    },
                  ]
                : []),
            ]}
          />

          <SoftProgressRow
            items={[
              ...(permissions.canViewProducts
                ? [
                    {
                      label: "Published",
                      value: published,
                      max: catalogTotal,
                      tone: "ink" as const,
                      href: "/guardian/products?status=PUBLISHED",
                    },
                    {
                      label: "In review",
                      value: inReview,
                      max: catalogTotal,
                      tone: "gold" as const,
                      href: "/guardian/products?status=REVIEW",
                    },
                    {
                      label: "Drafts",
                      value: draft,
                      max: catalogTotal,
                      tone: "ghost" as const,
                      href: "/guardian/products?status=DRAFT",
                    },
                  ]
                : []),
              ...(permissions.canViewInventory
                ? [
                    {
                      label: "Low stock",
                      value: lowStock,
                      max: Math.max(lowStock + reserved, lowStock, 1),
                      tone: "ghost" as const,
                      href: "/guardian/inventory/stock?lowStockOnly=true",
                    },
                  ]
                : []),
            ]}
          />

          <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
            <SoftCard className="lg:col-span-3" tone="accent">
              <SoftCardHeader
                title="Catalog focus"
                href="/guardian/products"
                meta="Publish readiness"
              />
              <div className="mt-6 space-y-4">
                <div className="flex items-center gap-3">
                  <span className="flex size-11 items-center justify-center rounded-2xl bg-[#1c1c1c] text-white">
                    <Package className="size-5" aria-hidden />
                  </span>
                  <div>
                    <p className="text-3xl font-semibold tabular-nums tracking-tight">
                      {published}
                    </p>
                    <p className="text-sm opacity-70">Live products</p>
                  </div>
                </div>
                <p className="text-sm leading-relaxed opacity-75">
                  {inReview > 0
                    ? `${inReview} still in review — keep governance moving.`
                    : "Catalog governance looks clear."}
                </p>
              </div>
            </SoftCard>

            <SoftCard className="lg:col-span-4">
              <SoftCardHeader
                title="Inventory & catalog pulse"
                href="/guardian/inventory"
                meta="Stock and lifecycle mix"
              />
              <SoftBarChart
                bars={inventoryBars}
                loading={inventory.loading || products.loading}
              />
            </SoftCard>

            <SoftCard className="lg:col-span-2">
              <SoftCardHeader title="Published share" href="/guardian/products" />
              <SoftRingStat
                label="Of catalog lifecycle"
                valueLabel={`${publishedShare}%`}
                percent={publishedShare}
                loading={products.loading}
              />
            </SoftCard>

            <div className="lg:col-span-3">
              <SoftTaskList
                title="Governance board"
                meta={`${governanceTasks.filter((t) => !t.done).length} open`}
                items={governanceTasks}
                empty="No governance blockers right now."
              />
            </div>
          </div>

          <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
            {permissions.canViewInventory ? (
              <SoftCard className="lg:col-span-4">
                <SoftCardHeader
                  title="Warehouse snapshot"
                  href="/guardian/inventory"
                  meta="Default warehouse totals"
                />
                {inventory.error ? (
                  <ErrorState onRetry={inventory.retry}>
                    {inventory.error}
                  </ErrorState>
                ) : inventory.loading ? (
                  <PageSkeleton />
                ) : inventory.data ? (
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "On hand", value: inventory.data.onHandTotal },
                      { label: "Reserved", value: inventory.data.reservedTotal },
                      {
                        label: "Low stock",
                        value: inventory.data.lowStockCount,
                      },
                      {
                        label: "Pending",
                        value: inventory.data.pendingReservations,
                      },
                    ].map((cell) => (
                      <div
                        key={cell.label}
                        className="rounded-[1.25rem] bg-black/[0.03] px-3.5 py-3 dark:bg-white/[0.04]"
                      >
                        <p className="text-[0.65rem] font-medium tracking-wide text-[#8a857a] uppercase dark:text-white/40">
                          {cell.label}
                        </p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-[#1c1c1c] dark:text-white">
                          {cell.value}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={<Warehouse />}
                    title="No inventory data"
                    description="Warehouse totals will appear here."
                  />
                )}
              </SoftCard>
            ) : null}

            {permissions.canViewProducts ? (
              <SoftCard className="lg:col-span-4">
                <SoftCardHeader
                  title="Catalog activity"
                  href="/guardian/products"
                  meta="Recently updated products"
                />
                {products.error ? (
                  <ErrorState onRetry={products.retry}>{products.error}</ErrorState>
                ) : products.loading ? (
                  <PageSkeleton />
                ) : productLinks.length === 0 ? (
                  <EmptyState
                    icon={<Package />}
                    title="No products yet"
                    description="Catalog products will appear here."
                  />
                ) : (
                  <SoftLinkRow items={productLinks} />
                )}
              </SoftCard>
            ) : null}

            {permissions.canViewOrders ? (
              <SoftCard className="lg:col-span-4">
                <SoftCardHeader
                  title="Recent commerce"
                  href="/guardian/orders"
                  meta={
                    permissions.canViewSubscriptions
                      ? `${activeSubs} active subscriptions`
                      : "Latest admin orders"
                  }
                />
                {orders.error ? (
                  <ErrorState onRetry={orders.retry}>{orders.error}</ErrorState>
                ) : orders.loading ? (
                  <PageSkeleton />
                ) : orderLinks.length === 0 ? (
                  <EmptyState
                    icon={<ShoppingCart />}
                    title="No orders yet"
                    description="Commerce activity will appear here."
                  />
                ) : (
                  <>
                    <SoftLinkRow items={orderLinks} />
                    {orders.data?.items[0] ? (
                      <div className="mt-3 flex items-center gap-2 rounded-2xl bg-black/[0.03] px-3 py-2 dark:bg-white/[0.04]">
                        <StatusBadge status={orders.data.items[0].status} />
                        <Link
                          href={`/guardian/orders/${orders.data.items[0].id}`}
                          className="truncate text-sm font-medium text-[#1c1c1c] hover:underline dark:text-white"
                        >
                          {orders.data.items[0].orderNumber}
                        </Link>
                      </div>
                    ) : null}
                  </>
                )}
              </SoftCard>
            ) : null}
          </div>

          {users.error ? (
            <ErrorState title="Unable to load user governance" onRetry={users.retry}>
              {users.error}
            </ErrorState>
          ) : null}
          {subscriptions.error ? (
            <ErrorState
              title="Unable to load subscription totals"
              onRetry={subscriptions.retry}
            >
              {subscriptions.error}
            </ErrorState>
          ) : null}
        </>
      )}
    </SoftDashboardShell>
  );
}
