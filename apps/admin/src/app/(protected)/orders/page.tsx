"use client";

import { ShoppingCart } from "lucide-react";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { ModuleComingSoon } from "@/components/layout/module-coming-soon";
import { Permissions } from "@/features/auth/permissions";

export default function OrdersPage() {
  return (
    <RequirePagePermission permission={Permissions.ORD_VIEW}>
      <ModuleComingSoon
        title="Orders"
        description="Orders management will be delivered in a future phase."
        icon={ShoppingCart}
      />
    </RequirePagePermission>
  );
}
