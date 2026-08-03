"use client";

import { Suspense } from "react";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { InventoryMovementsPage } from "@/features/inventory";
import { Permissions } from "@/features/auth/permissions";

export default function GuardianInventoryMovementsPage() {
  return (
    <RequirePagePermission permission={Permissions.INV_VIEW}>
      <Suspense fallback={<main className="px-6 py-10">Loading…</main>}>
        <InventoryMovementsPage />
      </Suspense>
    </RequirePagePermission>
  );
}
