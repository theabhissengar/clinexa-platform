"use client";

import { Users } from "lucide-react";

import { ModuleComingSoon } from "@/components/layout/module-coming-soon";
import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";

/**
 * Guardian Users — Create / View / Edit / Delete / Archive / Restore.
 */
export default function GuardianUsersPage() {
  return (
    <RequirePagePermission permission={Permissions.ADM_MANAGE_USERS}>
      <ModuleComingSoon
        title="Users"
        description="Administrative user lifecycle: create, view, edit, delete, archive, and restore. Destructive actions are Class D gated and never appear in CRM."
        icon={Users}
      />
    </RequirePagePermission>
  );
}
