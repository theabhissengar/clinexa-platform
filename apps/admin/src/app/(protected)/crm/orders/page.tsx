"use client";

import { ShoppingCart } from "lucide-react";

import { ModuleComingSoon } from "@/components/layout/module-coming-soon";
import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";

/**
 * CRM Orders — View / Edit (operational workflow).
 * Delete, Archive, Restore, Financial Corrections, Overrides are Guardian-only.
 */
export default function CrmOrdersPage() {
  return (
    <RequirePagePermission permission={Permissions.ORD_VIEW}>
      <ModuleComingSoon
        title="Orders"
        description="Operational order queues and workflow edits. Delete, archive, restore, financial corrections, and administrative overrides are Guardian-only."
        icon={ShoppingCart}
      />
    </RequirePagePermission>
  );
}
