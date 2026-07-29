"use client";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { CategoryCreatePage } from "@/features/categories/components/category-create-page";

export default function GuardianCategoryNewPage() {
  return (
    <RequirePagePermission permission={Permissions.CAT_MANAGE}>
      <CategoryCreatePage />
    </RequirePagePermission>
  );
}
