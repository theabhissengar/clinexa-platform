"use client";

import { usePermissions } from "@/features/auth/hooks/use-permissions";
import { Permissions } from "@/features/auth/permissions";
import { getInventoryDashboard } from "@/features/inventory/api/inventory-api";
import type { InventoryDashboard } from "@/features/inventory/types";
import { listAdminOrders } from "@/features/orders/api/admin-orders-api";
import type { OrderListResponse } from "@/features/orders/types";
import { listAdminProducts } from "@/features/products/api/products-api";
import type { ProductListResponse } from "@/features/products/types";
import { listAdminSubscriptions } from "@/features/subscriptions/api/admin-subscriptions-api";
import type { SubscriptionListResponse } from "@/features/subscriptions/types";
import { listAdminUsers } from "@/features/users/api/users-api";
import type { AdminUserListResponse } from "@/features/users/types";

import { useDashboardResource } from "./use-dashboard-resource";

function loadProducts(): Promise<ProductListResponse> {
  return listAdminProducts({ skip: 0, take: 8 });
}

function loadInventory(): Promise<InventoryDashboard> {
  return getInventoryDashboard();
}

function loadUsers(): Promise<AdminUserListResponse> {
  return listAdminUsers({ skip: 0, take: 1 });
}

function loadOrders(): Promise<OrderListResponse> {
  return listAdminOrders({ skip: 0, take: 8 });
}

function loadSubscriptions(): Promise<SubscriptionListResponse> {
  return listAdminSubscriptions({ skip: 0, take: 1 });
}

export function useGuardianDashboardData() {
  const { can } = usePermissions();
  const canViewProducts = can(Permissions.PRD_MANAGE);
  const canViewInventory = can(Permissions.INV_VIEW);
  const canViewUsers = can(Permissions.ADM_MANAGE_USERS);
  const canViewOrders = can(Permissions.ORD_VIEW);
  const canViewSubscriptions = can(Permissions.SUB_VIEW);

  const products = useDashboardResource(
    canViewProducts,
    loadProducts,
    "Unable to load catalog state.",
  );
  const inventory = useDashboardResource(
    canViewInventory,
    loadInventory,
    "Unable to load inventory health.",
  );
  const users = useDashboardResource(
    canViewUsers,
    loadUsers,
    "Unable to load user governance.",
  );
  const orders = useDashboardResource(
    canViewOrders,
    loadOrders,
    "Unable to load commerce activity.",
  );
  const subscriptions = useDashboardResource(
    canViewSubscriptions,
    loadSubscriptions,
    "Unable to load subscription totals.",
  );

  return {
    permissions: {
      canViewProducts,
      canViewInventory,
      canViewUsers,
      canViewOrders,
      canViewSubscriptions,
    },
    products,
    inventory,
    users,
    orders,
    subscriptions,
  };
}
