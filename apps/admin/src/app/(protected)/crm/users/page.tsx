"use client";

import { Users } from "lucide-react";

import { ModuleComingSoon } from "@/components/layout/module-coming-soon";
import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";

/**
 * CRM Users — operational View / Edit only.
 * Create, Delete, Archive, Restore remain Guardian-only.
 */
export default function CrmUsersPage() {
  return (
    <RequirePagePermission
      permission={[
        Permissions.CRM_PATIENT_RECORDS,
        Permissions.ADM_MANAGE_USERS,
      ]}
    >
      <ModuleComingSoon
        title="Users"
        description="Operational user and patient views with permitted field edits. Create, delete, archive, and restore are Guardian-only and will not appear here."
        icon={Users}
      />
    </RequirePagePermission>
  );
}
