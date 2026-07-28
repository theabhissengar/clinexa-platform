"use client";

import { FileText } from "lucide-react";

import { ModuleComingSoon } from "@/components/layout/module-coming-soon";
import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";

export default function CrmPrescriptionsPage() {
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
        description="Clinical and pharmacy prescription workflows will be delivered in a later phase."
        icon={FileText}
      />
    </RequirePagePermission>
  );
}
