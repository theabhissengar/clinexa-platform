"use client";

import { Suspense } from "react";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { InventoryPoliciesPage } from "@/features/inventory";
import { Permissions } from "@/features/auth/permissions";

export default function GuardianInventoryPoliciesPage() {
  return (
    <RequirePagePermission permission={Permissions.INV_MANAGE_WAREHOUSE}>
      <Suspense fallback={<main className="px-6 py-10">Loading…</main>}>
        <InventoryPoliciesPage />
      </Suspense>
    </RequirePagePermission>
  );
}
