"use client";

import { Suspense } from "react";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { InventoryDashboardPage } from "@/features/inventory";
import { Permissions } from "@/features/auth/permissions";

export default function GuardianInventoryPage() {
  return (
    <RequirePagePermission permission={Permissions.INV_VIEW}>
      <Suspense
        fallback={
          <main className="px-6 py-10 text-sm text-muted-foreground">
            Loading inventory…
          </main>
        }
      >
        <InventoryDashboardPage />
      </Suspense>
    </RequirePagePermission>
  );
}
