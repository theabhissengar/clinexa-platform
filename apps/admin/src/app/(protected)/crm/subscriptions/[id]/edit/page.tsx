"use client";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { CrmSubscriptionEditPage } from "@/features/subscriptions/components/crm-subscription-edit-page";

export default function CrmSubscriptionEditRoutePage() {
  return (
    <RequirePagePermission permission={Permissions.SUB_EDIT}>
      <CrmSubscriptionEditPage />
    </RequirePagePermission>
  );
}
