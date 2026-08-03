"use client";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { InventorySubnav } from "@/features/inventory/components/inventory-subnav";

export default function InventoryStockHistoryStubPage() {
  return (
    <RequirePagePermission permission={Permissions.INV_VIEW}>
      <main className="px-6 py-8">
        <h1 className="text-2xl font-semibold">Stock history</h1>
        <InventorySubnav />
        <p className="text-sm text-muted-foreground">
          Entity field/state history for this stock record. Quantity truth remains
          the movement ledger (see Movements). Full history UX lands with P12
          polish.
        </p>
      </main>
    </RequirePagePermission>
  );
}
