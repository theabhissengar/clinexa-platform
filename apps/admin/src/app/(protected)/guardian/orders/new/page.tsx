"use client";

import { Suspense } from "react";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { GuardianOrderCreatePage } from "@/features/orders/components/guardian-order-create-page";

export default function GuardianOrderNewPage() {
  return (
    <RequirePagePermission permission={Permissions.ORD_CREATE}>
      <Suspense fallback={<main className="px-6 py-10">Loading…</main>}>
        <GuardianOrderCreatePage />
      </Suspense>
    </RequirePagePermission>
  );
}
