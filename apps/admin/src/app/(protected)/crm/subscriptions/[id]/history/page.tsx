"use client";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { CrmSubscriptionHistoryPage } from "@/features/subscriptions/components/crm-subscription-history-page";

export default function CrmSubscriptionHistoryRoutePage() {
  return (
    <RequirePagePermission permission={Permissions.SUB_VIEW}>
      <CrmSubscriptionHistoryPage />
    </RequirePagePermission>
  );
}
