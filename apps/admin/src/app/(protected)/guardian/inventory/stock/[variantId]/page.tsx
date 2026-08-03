"use client";

import { Suspense } from "react";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { InventoryStockDetailPage } from "@/features/inventory";
import { Permissions } from "@/features/auth/permissions";

export default function GuardianInventoryStockDetailPage() {
  return (
    <RequirePagePermission permission={Permissions.INV_VIEW}>
      <Suspense fallback={<main className="px-6 py-10">Loading…</main>}>
        <InventoryStockDetailPage />
      </Suspense>
    </RequirePagePermission>
  );
}
