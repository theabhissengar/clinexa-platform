"use client";

import { Settings } from "lucide-react";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { ModuleComingSoon } from "@/components/layout/module-coming-soon";
import { Permissions } from "@/features/auth/permissions";

export default function SettingsPage() {
  return (
    <RequirePagePermission permission={Permissions.SET_MANAGE}>
      <ModuleComingSoon
        title="Settings"
        description="Platform settings will be delivered in a future phase."
        icon={Settings}
      />
    </RequirePagePermission>
  );
}
