"use client";

import { Suspense } from "react";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { CategoriesListPage } from "@/features/categories/components/categories-list-page";

export default function GuardianCategoriesPage() {
  return (
    <RequirePagePermission permission={Permissions.CAT_MANAGE}>
      <Suspense
        fallback={
          <main className="px-6 py-10 text-sm text-muted-foreground">
            Loading categories…
          </main>
        }
      >
        <CategoriesListPage />
      </Suspense>
    </RequirePagePermission>
  );
}
