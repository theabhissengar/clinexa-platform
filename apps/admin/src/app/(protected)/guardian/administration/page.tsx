"use client";

import { Shield } from "lucide-react";

import { ModuleComingSoon } from "@/components/layout/module-coming-soon";
import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";

export default function GuardianAdministrationPage() {
  return (
    <RequirePagePermission permission={Permissions.ADM_ACCESS_ADMINISTRATION}>
      <ModuleComingSoon
        title="Administration"
        description="Platform Administration console surfaces will be delivered in a later phase. Requires Super Administrator."
        icon={Shield}
      />
    </RequirePagePermission>
  );
}
