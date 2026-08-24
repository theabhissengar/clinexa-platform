"use client";

import { Suspense } from "react";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { GuardianSubscriptionsListPage } from "@/features/subscriptions/components/guardian-subscriptions-list-page";

export default function GuardianSubscriptionsPage() {
  return (
    <RequirePagePermission permission={Permissions.SUB_VIEW}>
      <Suspense fallback={<main className="px-6 py-10">Loading…</main>}>
        <GuardianSubscriptionsListPage />
      </Suspense>
    </RequirePagePermission>
  );
}
