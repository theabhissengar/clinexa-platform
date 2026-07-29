"use client";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { CategoryDetailPage } from "@/features/categories/components/category-detail-page";

export default function GuardianCategoryEditPage() {
  return (
    <RequirePagePermission permission={Permissions.CAT_MANAGE}>
      <CategoryDetailPage />
    </RequirePagePermission>
  );
}
