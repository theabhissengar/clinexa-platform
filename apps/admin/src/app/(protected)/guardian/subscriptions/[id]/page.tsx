"use client";

import { Suspense } from "react";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { GuardianSubscriptionDetailPage } from "@/features/subscriptions/components/guardian-subscription-detail-page";

export default function GuardianSubscriptionDetailRoutePage() {
  return (
    <RequirePagePermission permission={Permissions.SUB_VIEW}>
      <Suspense fallback={<main className="px-6 py-10">Loading…</main>}>
        <GuardianSubscriptionDetailPage />
      </Suspense>
    </RequirePagePermission>
  );
}
