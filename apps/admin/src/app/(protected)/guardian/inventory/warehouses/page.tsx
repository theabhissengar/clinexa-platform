"use client";

import { Suspense } from "react";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { InventoryWarehousesPage } from "@/features/inventory";
import { Permissions } from "@/features/auth/permissions";

export default function GuardianInventoryWarehousesPage() {
  return (
    <RequirePagePermission permission={Permissions.INV_MANAGE_WAREHOUSE}>
      <Suspense fallback={<main className="px-6 py-10">Loading…</main>}>
        <InventoryWarehousesPage />
      </Suspense>
    </RequirePagePermission>
  );
}
