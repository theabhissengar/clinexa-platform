"use client";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { CrmUserDetailPage } from "@/features/users/components/crm-user-detail-page";

export default function CrmUserDetailRoutePage() {
  return (
    <RequirePagePermission
      permission={[
        Permissions.CRM_PATIENT_RECORDS,
        Permissions.ADM_MANAGE_USERS,
      ]}
    >
      <CrmUserDetailPage />
    </RequirePagePermission>
  );
}
