"use client";

import { Suspense } from "react";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { RolesListPage } from "@/features/users/components/roles-list-page";

export default function GuardianRolesPage() {
  return (
    <RequirePagePermission permission={Permissions.ADM_ASSIGN_ROLES}>
      <Suspense
        fallback={
          <main className="px-6 py-10 text-sm text-muted-foreground">
            Loading roles…
          </main>
        }
      >
        <RolesListPage />
      </Suspense>
    </RequirePagePermission>
  );
}
