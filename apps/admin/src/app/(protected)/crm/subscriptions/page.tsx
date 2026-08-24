"use client";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { CrmSubscriptionsListPage } from "@/features/subscriptions/components/crm-subscriptions-list-page";

export default function CrmSubscriptionsPage() {
  return (
    <RequirePagePermission permission={Permissions.SUB_VIEW}>
      <CrmSubscriptionsListPage />
    </RequirePagePermission>
  );
}
