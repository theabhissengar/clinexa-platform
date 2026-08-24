"use client";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { GuardianSubscriptionHistoryPage } from "@/features/subscriptions/components/guardian-subscription-history-page";

export default function GuardianSubscriptionHistoryRoutePage() {
  return (
    <RequirePagePermission permission={Permissions.SUB_VIEW}>
      <GuardianSubscriptionHistoryPage />
    </RequirePagePermission>
  );
}
