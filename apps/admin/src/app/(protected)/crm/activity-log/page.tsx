"use client";

import { Activity } from "lucide-react";

import { ModuleComingSoon } from "@/components/layout/module-coming-soon";
import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";

/**
 * CRM Activity Log — operational activity visibility.
 */
export default function CrmActivityLogPage() {
  return (
    <RequirePagePermission
      permission={[
        Permissions.ANL_OPS_CLINICAL,
        Permissions.ADM_VIEW_AUDIT,
        Permissions.ORD_VIEW,
      ]}
    >
      <ModuleComingSoon
        title="Activity Log"
        description="Operational activity for day-to-day work. Administrative audit and governance logs remain in Guardian."
        icon={Activity}
      />
    </RequirePagePermission>
  );
}
