"use client";

import { FileText } from "lucide-react";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { ModuleComingSoon } from "@/components/layout/module-coming-soon";
import { Permissions } from "@/features/auth/permissions";

export default function PrescriptionsPage() {
  return (
    <RequirePagePermission
      permission={[
        Permissions.CRM_APPROVE_RX,
        Permissions.CRM_PHARMACY_REVIEW,
        Permissions.CRM_PHARMACY_READY,
      ]}
    >
      <ModuleComingSoon
        title="Prescriptions"
        description="Prescriptions management will be delivered in a future phase."
        icon={FileText}
      />
    </RequirePagePermission>
  );
}
