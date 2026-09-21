"use client";

import {
  Boxes,
  CreditCard,
  Image,
  Package,
  Repeat,
  ShoppingCart,
  TicketPercent,
  Users,
  Warehouse,
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
import { usePermissions } from "@/features/auth/hooks/use-permissions";
import { Permissions } from "@/features/auth/permissions";
import { customerLabel, formatDateTime } from "@/features/orders/lib/format";

import { DashboardMetricGrid } from "./dashboard-metric-grid";
import { DashboardSectionCard } from "./dashboard-section-card";
import {
  DashboardShortcuts,
  type DashboardShortcut,
} from "./dashboard-shortcuts";
import { useGuardianDashboardData } from "../hooks/use-guardian-dashboard-data";

export function GuardianDashboardPage() {
  const dashboard = useGuardianDashboardData();
  const { can } = usePermissions();
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

  const shortcuts: DashboardShortcut[] = [
    ...(permissions.canViewProducts
      ? [{ label: "Products", href: "/guardian/products", icon: Package }]
      : []),
    ...(permissions.canViewInventory
      ? [
          {
            label: "Inventory",
            href: "/guardian/inventory",
            icon: Warehouse,
          },
        ]
      : []),
    ...(permissions.canViewUsers
      ? [{ label: "Users", href: "/guardian/users", icon: Users }]
      : []),
    ...(permissions.canViewOrders
      ? [{ label: "Orders", href: "/guardian/orders", icon: ShoppingCart }]
      : []),
    ...(permissions.canViewSubscriptions
      ? [
          {
            label: "Subscriptions",
            href: "/guardian/subscriptions",
            icon: Repeat,
          },
        ]
      : []),
    ...(can(Permissions.CPN_CONFIGURE)
      ? [
          {
            label: "Coupons",
            href: "/guardian/coupons",
            icon: TicketPercent,
          },
        ]
      : []),
    ...(permissions.canViewOrders
      ? [
          {
            label: "Payments",
            href: "/guardian/payments",
            icon: CreditCard,
          },
        ]
      : []),
    ...(can(Permissions.AST_VIEW)
      ? [{ label: "Assets", href: "/guardian/assets", icon: Image }]
      : []),
  ];

  const productCounts = products.data?.statusCounts;
  const subscriptionCounts = subscriptions.data?.statusCounts;
  const userCounts = users.data?.statusCounts;

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
                  Administrative health across catalog, inventory, users, and
                  commerce.
                </PageHeaderDescription>
              </PageHeaderCopy>
            </PageHeader>

            {!hasWidgets ? (
              <EmptyState
                icon={<Boxes />}
                title="No administrative widgets available"
                description="Your account can access Guardian, but no dashboard business modules are assigned."
              />
            ) : (
              <>
                <DashboardMetricGrid>
                  {permissions.canViewProducts ? (
                    <>
                      <MetricCard
                        label="Published products"
                        value={productCounts?.PUBLISHED}
                        hint="Available catalog"
                        icon={<Package />}
                        href="/guardian/products?status=PUBLISHED"
                        loading={products.loading}
                      />
                      <MetricCard
                        label="In review"
                        value={productCounts?.REVIEW}
                        hint="Catalog governance queue"
                        icon={<Package />}
                        href="/guardian/products?status=REVIEW"
                        tone={
                          (productCounts?.REVIEW ?? 0) > 0
                            ? "warning"
                            : "neutral"
                        }
                        loading={products.loading}
                      />
                      <MetricCard
                        label="Draft products"
                        value={productCounts?.DRAFT}
                        hint="Unpublished catalog work"
                        icon={<Package />}
                        href="/guardian/products?status=DRAFT"
                        loading={products.loading}
                      />
                    </>
                  ) : null}
                  {permissions.canViewInventory ? (
                    <MetricCard
                      label="Low stock"
                      value={inventory.data?.lowStockCount}
                      hint="SKUs at or below threshold"
                      icon={<Warehouse />}
                      href="/guardian/inventory/stock?lowStockOnly=true"
                      tone={
                        (inventory.data?.lowStockCount ?? 0) > 0
                          ? "warning"
                          : "neutral"
                      }
                      loading={inventory.loading}
                    />
                  ) : null}
                  {permissions.canViewUsers ? (
                    <>
                      <MetricCard
                        label="Users"
                        value={users.data?.total}
                        hint="Administrative user records"
                        icon={<Users />}
                        href="/guardian/users"
                        loading={users.loading}
                      />
                      <MetricCard
                        label="Pending verification"
                        value={userCounts?.PENDING_VERIFICATION}
                        hint="Accounts requiring follow-up"
                        icon={<Users />}
                        href="/guardian/users?status=PENDING_VERIFICATION"
                        tone={
                          (userCounts?.PENDING_VERIFICATION ?? 0) > 0
                            ? "warning"
                            : "neutral"
                        }
                        loading={users.loading}
                      />
                    </>
                  ) : null}
                  {permissions.canViewSubscriptions ? (
                    <MetricCard
                      label="Active subscriptions"
                      value={subscriptionCounts?.ACTIVE}
                      hint="Current commerce plans"
                      icon={<Repeat />}
                      href="/guardian/subscriptions?status=ACTIVE"
                      loading={subscriptions.loading}
                    />
                  ) : null}
                  {permissions.canViewOrders ? (
                    <MetricCard
                      label="Orders"
                      value={orders.data?.statusCounts.ALL}
                      hint="Administrative commerce volume"
                      icon={<ShoppingCart />}
                      href="/guardian/orders"
                      loading={orders.loading}
                    />
                  ) : null}
                </DashboardMetricGrid>

                <div className="grid min-w-0 gap-6 lg:grid-cols-2">
                  {permissions.canViewProducts ? (
                    <DashboardSectionCard
                      title="Catalog activity"
                      description="Recently updated product records and publish state."
                      href="/guardian/products"
                    >
                      <DataTable
                        density="dense"
                        loading={products.loading}
                        empty={(products.data?.items.length ?? 0) === 0}
                        error={
                          products.error ? (
                            <ErrorState onRetry={products.retry}>
                              {products.error}
                            </ErrorState>
                          ) : undefined
                        }
                        emptyState={
                          <EmptyState
                            icon={<Package />}
                            title="No products yet"
                            description="Catalog products will appear here."
                          />
                        }
                      >
                        <TableHeader>
                          <TableRow>
                            <TableHead>Product</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="hidden sm:table-cell">
                              Updated
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {products.data?.items.map((product) => (
                            <TableRow key={product.id}>
                              <TableCell>
                                <Link
                                  href={`/guardian/products/${product.id}`}
                                  className="font-medium text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                  {product.name}
                                </Link>
                              </TableCell>
                              <TableCell>
                                <StatusBadge
                                  status={product.lifecycleStatus}
                                  label={
                                    product.lifecycleStatus === "UNPUBLISHED"
                                      ? "Private"
                                      : undefined
                                  }
                                />
                              </TableCell>
                              <TableCell className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">
                                {formatDateTime(product.updatedAt)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </DataTable>
                    </DashboardSectionCard>
                  ) : null}

                  {permissions.canViewInventory ? (
                    <DashboardSectionCard
                      title="Inventory health"
                      description="Current default-warehouse stock summary."
                      href="/guardian/inventory"
                    >
                      {inventory.error ? (
                        <ErrorState onRetry={inventory.retry}>
                          {inventory.error}
                        </ErrorState>
                      ) : inventory.loading ? (
                        <div className="grid grid-cols-2 gap-4">
                          {Array.from({ length: 4 }, (_, index) => (
                            <MetricCard
                              key={index}
                              label="Inventory metric"
                              loading
                            />
                          ))}
                        </div>
                      ) : inventory.data ? (
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
                          <div>
                            <dt className="text-caption text-muted-foreground">
                              On hand
                            </dt>
                            <dd className="mt-1 font-heading text-h1 font-semibold tabular-nums">
                              {inventory.data.onHandTotal}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-caption text-muted-foreground">
                              Reserved
                            </dt>
                            <dd className="mt-1 font-heading text-h1 font-semibold tabular-nums">
                              {inventory.data.reservedTotal}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-caption text-muted-foreground">
                              Low stock
                            </dt>
                            <dd className="mt-1 font-heading text-h1 font-semibold tabular-nums">
                              {inventory.data.lowStockCount}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-caption text-muted-foreground">
                              Pending reservations
                            </dt>
                            <dd className="mt-1 font-heading text-h1 font-semibold tabular-nums">
                              {inventory.data.pendingReservations}
                            </dd>
                          </div>
                        </dl>
                      ) : (
                        <EmptyState
                          icon={<Warehouse />}
                          title="No inventory summary"
                          description="Inventory health is not available."
                        />
                      )}
                    </DashboardSectionCard>
                  ) : null}
                </div>

                {permissions.canViewOrders ? (
                  <DashboardSectionCard
                    title="Recent commerce activity"
                    description="Latest administrative order records."
                    href="/guardian/orders"
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
                          description="Recent commerce activity will appear here."
                        />
                      }
                    >
                      <TableHeader>
                        <TableRow>
                          <TableHead>Order</TableHead>
                          <TableHead className="hidden sm:table-cell">
                            Customer
                          </TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Created</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orders.data?.items.map((order) => (
                          <TableRow key={order.id}>
                            <TableCell>
                              <Link
                                href={`/guardian/orders/${order.id}`}
                                className="font-medium text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                {order.orderNumber}
                              </Link>
                            </TableCell>
                            <TableCell className="hidden max-w-48 truncate sm:table-cell">
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

                {users.error ? (
                  <ErrorState
                    title="Unable to load user governance"
                    onRetry={users.retry}
                  >
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

                <DashboardShortcuts items={shortcuts} />
              </>
            )}
          </PageBody>
        )}
      </ClinexaPage>
    </PageCanvas>
  );
}
