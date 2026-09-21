"use client";

import { usePermissions } from "@/features/auth/hooks/use-permissions";
import { Permissions } from "@/features/auth/permissions";
import { listCrmOrders } from "@/features/orders/api/orders-api";
import type { OrderListResponse } from "@/features/orders/types";
import { listCrmSubscriptions } from "@/features/subscriptions/api/subscriptions-api";
import type { SubscriptionListResponse } from "@/features/subscriptions/types";
import { listCrmUsers } from "@/features/users/api/users-api";
import type { CrmUserListResponse } from "@/features/users/types";

import { useDashboardResource } from "./use-dashboard-resource";

export type CrmSubscriptionAttention = {
  response: SubscriptionListResponse;
  mode: "past-due" | "due-soon";
};

function loadRecentOrders(): Promise<OrderListResponse> {
  // Larger sample powers ops widgets + Insights charts from the same live list.
  return listCrmOrders({ skip: 0, take: 48 });
}

function loadRenewalOrders(): Promise<OrderListResponse> {
  return listCrmOrders({
    orderType: "SUBSCRIPTION_RENEWAL",
    skip: 0,
    take: 48,
  });
}

async function loadSubscriptionAttention(): Promise<CrmSubscriptionAttention> {
  const pastDue = await listCrmSubscriptions({
    status: "PAST_DUE",
    skip: 0,
    take: 6,
  });

  if (pastDue.items.length > 0) {
    return { response: pastDue, mode: "past-due" };
  }

  const now = new Date();
  const sevenDaysFromNow = new Date(now);
  sevenDaysFromNow.setDate(now.getDate() + 7);

  const dueSoon = await listCrmSubscriptions({
    nextRenewalFrom: now.toISOString(),
    nextRenewalTo: sevenDaysFromNow.toISOString(),
    skip: 0,
    take: 6,
  });

  return { response: dueSoon, mode: "due-soon" };
}

function loadPatients(): Promise<CrmUserListResponse> {
  return listCrmUsers({ skip: 0, take: 1 });
}

export function useCrmDashboardData() {
  const { can } = usePermissions();
  const canViewOrders = can(Permissions.ORD_VIEW);
  const canViewSubscriptions = can(Permissions.SUB_VIEW);
  const canViewPatients =
    can(Permissions.CRM_PATIENT_RECORDS) ||
    can(Permissions.ADM_MANAGE_USERS);

  const orders = useDashboardResource(
    canViewOrders,
    loadRecentOrders,
    "Unable to load order activity.",
  );
  const renewals = useDashboardResource(
    canViewOrders,
    loadRenewalOrders,
    "Unable to load renewal activity.",
  );
  const subscriptions = useDashboardResource(
    canViewSubscriptions,
    loadSubscriptionAttention,
    "Unable to load subscription attention.",
  );
  const patients = useDashboardResource(
    canViewPatients,
    loadPatients,
    "Unable to load patient totals.",
  );

  return {
    permissions: {
      canViewOrders,
      canViewSubscriptions,
      canViewPatients,
    },
    orders,
    renewals,
    subscriptions,
    patients,
  };
}
