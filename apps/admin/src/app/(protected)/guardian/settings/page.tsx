"use client";

import { Settings } from "lucide-react";

import { ModuleComingSoon } from "@/components/layout/module-coming-soon";
import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";

export default function GuardianSettingsPage() {
  return (
    <RequirePagePermission permission={Permissions.SET_MANAGE}>
      <ModuleComingSoon
        title="Settings"
        description="Platform policy configuration will be delivered in a later phase."
        icon={Settings}
      />
    </RequirePagePermission>
  );
}
