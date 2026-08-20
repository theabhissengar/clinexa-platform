"use client";

import { Suspense } from "react";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { GuardianOrderEditPage } from "@/features/orders/components/guardian-order-edit-page";

export default function GuardianOrderEditRoutePage() {
  return (
    <RequirePagePermission permission={Permissions.ORD_EDIT}>
      <Suspense fallback={<main className="px-6 py-10">Loading…</main>}>
        <GuardianOrderEditPage />
      </Suspense>
    </RequirePagePermission>
  );
}
