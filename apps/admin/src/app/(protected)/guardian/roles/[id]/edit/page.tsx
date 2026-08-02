"use client";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { RoleEditorPage } from "@/features/users/components/role-editor-page";

export default function GuardianRoleEditPage() {
  return (
    <RequirePagePermission permission={Permissions.ADM_ASSIGN_ROLES}>
      <RoleEditorPage />
    </RequirePagePermission>
  );
}
