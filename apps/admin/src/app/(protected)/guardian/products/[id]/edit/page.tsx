"use client";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { ProductEditPage } from "@/features/products/components/product-edit-page";

export default function GuardianProductEditPage() {
  return (
    <RequirePagePermission permission={Permissions.PRD_MANAGE}>
      <ProductEditPage />
    </RequirePagePermission>
  );
}
