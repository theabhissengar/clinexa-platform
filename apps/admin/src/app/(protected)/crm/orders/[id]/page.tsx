"use client";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { CrmOrderDetailPage } from "@/features/orders/components/crm-order-detail-page";

export default function CrmOrderDetailRoutePage() {
  return (
    <RequirePagePermission permission={Permissions.ORD_VIEW}>
      <CrmOrderDetailPage />
    </RequirePagePermission>
  );
}
