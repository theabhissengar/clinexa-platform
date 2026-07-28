"use client";

import { ChartColumn } from "lucide-react";

import { ModuleComingSoon } from "@/components/layout/module-coming-soon";
import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";

export default function CrmReportsPage() {
  return (
    <RequirePagePermission permission={Permissions.RPT_VIEW}>
      <ModuleComingSoon
        title="Reports"
        description="Operational and clinical-ops reports will be delivered in a later phase. Reports are CRM-only; artifact purge remains a Class D capability for a later phase."
        icon={ChartColumn}
      />
    </RequirePagePermission>
  );
}
