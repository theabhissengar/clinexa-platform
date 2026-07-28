"use client";

import { Activity } from "lucide-react";

import { ModuleComingSoon } from "@/components/layout/module-coming-soon";
import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";

export default function GuardianActivityLogPage() {
  return (
    <RequirePagePermission permission={Permissions.ADM_VIEW_AUDIT}>
      <ModuleComingSoon
        title="Activity Log"
        description="Administrative activity and audit visibility will be delivered in a later phase."
        icon={Activity}
      />
    </RequirePagePermission>
  );
}
