"use client";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { GuardianSubscriptionActivityPage } from "@/features/subscriptions/components/guardian-subscription-activity-page";

export default function GuardianSubscriptionActivityRoutePage() {
  return (
    <RequirePagePermission permission={Permissions.SUB_VIEW}>
      <GuardianSubscriptionActivityPage />
    </RequirePagePermission>
  );
}
