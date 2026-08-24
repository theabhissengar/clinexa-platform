"use client";

import { Suspense } from "react";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { GuardianSubscriptionPlansListPage } from "@/features/subscriptions/components/guardian-subscription-plans-list-page";

export default function GuardianSubscriptionPlansPage() {
  return (
    <RequirePagePermission permission={Permissions.SUB_CONFIGURE_PLANS}>
      <Suspense fallback={<main className="px-6 py-10">Loading…</main>}>
        <GuardianSubscriptionPlansListPage />
      </Suspense>
    </RequirePagePermission>
  );
}
