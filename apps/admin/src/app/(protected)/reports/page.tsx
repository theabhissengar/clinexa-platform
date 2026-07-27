"use client";

import { ChartColumn } from "lucide-react";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { ModuleComingSoon } from "@/components/layout/module-coming-soon";
import { Permissions } from "@/features/auth/permissions";

export default function ReportsPage() {
  return (
    <RequirePagePermission permission={Permissions.RPT_VIEW}>
      <ModuleComingSoon
        title="Reports"
        description="Reports will be delivered in a future phase."
        icon={ChartColumn}
      />
    </RequirePagePermission>
  );
}
