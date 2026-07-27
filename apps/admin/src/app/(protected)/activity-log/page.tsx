"use client";

import { Activity } from "lucide-react";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { ModuleComingSoon } from "@/components/layout/module-coming-soon";
import { Permissions } from "@/features/auth/permissions";

export default function ActivityLogPage() {
  return (
    <RequirePagePermission permission={Permissions.ADM_VIEW_AUDIT}>
      <ModuleComingSoon
        title="Activity Log"
        description="Activity Log will be delivered in a future phase."
        icon={Activity}
      />
    </RequirePagePermission>
  );
}
