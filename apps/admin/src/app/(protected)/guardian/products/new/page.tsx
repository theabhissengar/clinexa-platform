"use client";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { ProductCreatePage } from "@/features/products/components/product-create-page";

export default function GuardianProductNewPage() {
  return (
    <RequirePagePermission permission={Permissions.PRD_MANAGE}>
      <ProductCreatePage />
    </RequirePagePermission>
  );
}
