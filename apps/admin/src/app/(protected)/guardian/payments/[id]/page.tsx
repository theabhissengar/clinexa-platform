"use client";

import { Suspense } from "react";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { GuardianPaymentDetailPage } from "@/features/payments/components/guardian-payment-detail-page";

export default function GuardianPaymentDetailRoutePage() {
  return (
    <RequirePagePermission permission={Permissions.ORD_VIEW}>
      <Suspense fallback={<main className="px-6 py-10">Loading…</main>}>
        <GuardianPaymentDetailPage />
      </Suspense>
    </RequirePagePermission>
  );
}
