"use client";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { InventorySubnav } from "@/features/inventory/components/inventory-subnav";

export default function InventoryStockActivityStubPage() {
  return (
    <RequirePagePermission permission={Permissions.INV_VIEW}>
      <main className="px-6 py-8">
        <h1 className="text-2xl font-semibold">Stock activity</h1>
        <InventorySubnav />
        <p className="text-sm text-muted-foreground">
          User/system interaction activity for this stock record (not platform
          Audit Log, not the movement ledger SoT).
        </p>
      </main>
    </RequirePagePermission>
  );
}
