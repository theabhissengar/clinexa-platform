"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { UserEditorPage } from "@/features/users/components/user-editor-page";

function GuardianUserEditInner() {
  const params = useParams<{ id: string }>();
  return (
    <RequirePagePermission permission={Permissions.ADM_MANAGE_USERS}>
      <UserEditorPage userId={params.id} />
    </RequirePagePermission>
  );
}

export default function GuardianUserEditPage() {
  return (
    <Suspense fallback={<main className="px-6 py-10">Loading…</main>}>
      <GuardianUserEditInner />
    </Suspense>
  );
}
