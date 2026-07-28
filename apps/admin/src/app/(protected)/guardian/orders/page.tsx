"use client";

import { ShoppingCart } from "lucide-react";

import { ModuleComingSoon } from "@/components/layout/module-coming-soon";
import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";

/**
 * Guardian Orders — full administrative lifecycle including destructive actions later.
 */
export default function GuardianOrdersPage() {
  return (
    <RequirePagePermission permission={Permissions.ORD_VIEW}>
      <ModuleComingSoon
        title="Orders"
        description="Administrative order management: view, edit, create, plus delete, archive, restore, financial corrections, and overrides (Class D gated in a later phase)."
        icon={ShoppingCart}
      />
    </RequirePagePermission>
  );
}
