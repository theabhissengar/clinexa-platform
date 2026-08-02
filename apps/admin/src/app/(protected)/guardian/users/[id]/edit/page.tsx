"use client";

import { useParams } from "next/navigation";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { UserEditorPage } from "@/features/users/components/user-editor-page";

export default function GuardianUserEditPage() {
  const params = useParams<{ id: string }>();
  return (
    <RequirePagePermission permission={Permissions.ADM_MANAGE_USERS}>
      <UserEditorPage userId={params.id} />
    </RequirePagePermission>
  );
}
