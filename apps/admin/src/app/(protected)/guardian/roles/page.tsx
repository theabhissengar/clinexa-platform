"use client";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { RolesListPage } from "@/features/users/components/roles-list-page";

export default function GuardianRolesPage() {
  return (
    <RequirePagePermission permission={Permissions.ADM_ASSIGN_ROLES}>
      <RolesListPage />
    </RequirePagePermission>
  );
}
