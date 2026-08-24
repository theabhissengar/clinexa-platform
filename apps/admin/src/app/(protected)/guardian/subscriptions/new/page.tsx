"use client";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { GuardianSubscriptionCreatePage } from "@/features/subscriptions/components/guardian-subscription-create-page";

export default function GuardianSubscriptionNewPage() {
  return (
    <RequirePagePermission permission={Permissions.SUB_CREATE}>
      <GuardianSubscriptionCreatePage />
    </RequirePagePermission>
  );
}
