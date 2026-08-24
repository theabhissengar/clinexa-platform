"use client";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { GuardianSubscriptionEditPage } from "@/features/subscriptions/components/guardian-subscription-edit-page";

export default function GuardianSubscriptionEditRoutePage() {
  return (
    <RequirePagePermission permission={Permissions.SUB_EDIT}>
      <GuardianSubscriptionEditPage />
    </RequirePagePermission>
  );
}
