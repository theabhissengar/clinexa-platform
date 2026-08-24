"use client";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { CrmSubscriptionDetailPage } from "@/features/subscriptions/components/crm-subscription-detail-page";

export default function CrmSubscriptionDetailRoutePage() {
  return (
    <RequirePagePermission permission={Permissions.SUB_VIEW}>
      <CrmSubscriptionDetailPage />
    </RequirePagePermission>
  );
}
