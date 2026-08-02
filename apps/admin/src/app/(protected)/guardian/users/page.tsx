"use client";

import { Suspense } from "react";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { UsersListPage } from "@/features/users/components/users-list-page";

export default function GuardianUsersPage() {
  return (
    <RequirePagePermission permission={Permissions.ADM_MANAGE_USERS}>
      <Suspense
        fallback={
          <main className="px-6 py-10 text-sm text-muted-foreground">
            Loading users…
          </main>
        }
      >
        <UsersListPage />
      </Suspense>
    </RequirePagePermission>
  );
}
