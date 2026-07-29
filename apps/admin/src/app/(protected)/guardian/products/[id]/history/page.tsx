"use client";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { ProductHistoryPage } from "@/features/products/components/product-history-page";

export default function GuardianProductHistoryPage() {
  return (
    <RequirePagePermission permission={Permissions.PRD_MANAGE}>
      <ProductHistoryPage />
    </RequirePagePermission>
  );
}
