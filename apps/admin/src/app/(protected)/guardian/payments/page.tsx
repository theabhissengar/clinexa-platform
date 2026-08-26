"use client";

import { Suspense } from "react";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { GuardianPaymentsListPage } from "@/features/payments/components/guardian-payments-list-page";

export default function GuardianPaymentsPage() {
  return (
    <RequirePagePermission permission={Permissions.ORD_VIEW}>
      <Suspense fallback={<main className="px-6 py-10">Loading…</main>}>
        <GuardianPaymentsListPage />
      </Suspense>
    </RequirePagePermission>
  );
}
