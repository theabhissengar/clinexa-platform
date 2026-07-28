"use client";

import { Package } from "lucide-react";

import { ModuleComingSoon } from "@/components/layout/module-coming-soon";
import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";

export default function GuardianProductsPage() {
  return (
    <RequirePagePermission permission={Permissions.PRD_MANAGE}>
      <ModuleComingSoon
        title="Products"
        description="Product catalog administration placeholder. Full CRUD and publish flows ship in a later phase."
        icon={Package}
      />
    </RequirePagePermission>
  );
}
