"use client";

import { Suspense } from "react";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { GuardianOrderDetailPage } from "@/features/orders/components/guardian-order-detail-page";

export default function GuardianOrderDetailRoutePage() {
  return (
    <RequirePagePermission permission={Permissions.ORD_VIEW}>
      <Suspense fallback={<main className="px-6 py-10">Loading…</main>}>
        <GuardianOrderDetailPage />
      </Suspense>
    </RequirePagePermission>
  );
}
