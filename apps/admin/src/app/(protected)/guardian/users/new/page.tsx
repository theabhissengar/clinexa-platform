"use client";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { UserCreatePage } from "@/features/users/components/user-create-page";

export default function GuardianUserNewPage() {
  return (
    <RequirePagePermission permission={Permissions.ADM_MANAGE_USERS}>
      <UserCreatePage />
    </RequirePagePermission>
  );
}
