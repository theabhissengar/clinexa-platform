"use client";

import { Suspense } from "react";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { GuardianPaymentProvidersPage } from "@/features/payments/components/guardian-payment-providers-page";

export default function GuardianPaymentProvidersRoutePage() {
  return (
    <RequirePagePermission permission={Permissions.SET_OVERSELL_POLICIES}>
      <Suspense fallback={<main className="px-6 py-10">Loading…</main>}>
        <GuardianPaymentProvidersPage />
      </Suspense>
    </RequirePagePermission>
  );
}
