"use client";

import { Suspense } from "react";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { InventoryReceivingPage } from "@/features/inventory";
import { Permissions } from "@/features/auth/permissions";

export default function GuardianInventoryReceivingPage() {
  return (
    <RequirePagePermission permission={Permissions.INV_MANAGE_STOCK}>
      <Suspense fallback={<main className="px-6 py-10">Loading…</main>}>
        <InventoryReceivingPage />
      </Suspense>
    </RequirePagePermission>
  );
}
