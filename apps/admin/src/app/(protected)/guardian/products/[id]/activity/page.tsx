"use client";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { ProductActivityPage } from "@/features/products/components/product-activity-page";

export default function GuardianProductActivityPage() {
  return (
    <RequirePagePermission permission={Permissions.PRD_MANAGE}>
      <ProductActivityPage />
    </RequirePagePermission>
  );
}
