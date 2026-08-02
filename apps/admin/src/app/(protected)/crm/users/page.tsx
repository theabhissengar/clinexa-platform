"use client";

import { Suspense } from "react";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { CrmUsersListPage } from "@/features/users/components/crm-users-list-page";

export default function CrmUsersPage() {
  return (
    <RequirePagePermission
      permission={[
        Permissions.CRM_PATIENT_RECORDS,
        Permissions.ADM_MANAGE_USERS,
      ]}
    >
      <Suspense
        fallback={
          <main className="px-6 py-10 text-sm text-muted-foreground">
            Loading users…
          </main>
        }
      >
        <CrmUsersListPage />
      </Suspense>
    </RequirePagePermission>
  );
}
