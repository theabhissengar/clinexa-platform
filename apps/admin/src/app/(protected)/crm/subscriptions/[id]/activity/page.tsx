"use client";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { CrmSubscriptionActivityPage } from "@/features/subscriptions/components/crm-subscription-activity-page";

export default function CrmSubscriptionActivityRoutePage() {
  return (
    <RequirePagePermission permission={Permissions.SUB_VIEW}>
      <CrmSubscriptionActivityPage />
    </RequirePagePermission>
  );
}
