"use client";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { CrmOrderEditPage } from "@/features/orders/components/crm-order-edit-page";

export default function CrmOrderEditRoutePage() {
  return (
    <RequirePagePermission permission={Permissions.ORD_EDIT}>
      <CrmOrderEditPage />
    </RequirePagePermission>
  );
}
