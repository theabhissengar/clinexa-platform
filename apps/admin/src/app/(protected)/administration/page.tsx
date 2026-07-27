"use client";

import { Shield } from "lucide-react";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { ModuleComingSoon } from "@/components/layout/module-coming-soon";
import { Permissions } from "@/features/auth/permissions";

export default function AdministrationPage() {
  return (
    <RequirePagePermission permission={Permissions.ADM_ACCESS_ADMINISTRATION}>
      <ModuleComingSoon
        title="Administration"
        description="Platform Administration will be delivered in a future phase."
        icon={Shield}
      />
    </RequirePagePermission>
  );
}
