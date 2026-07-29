"use client";

import { Suspense } from "react";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { ProductsListPage } from "@/features/products/components/products-list-page";

export default function GuardianProductsPage() {
  return (
    <RequirePagePermission permission={Permissions.PRD_MANAGE}>
      <Suspense
        fallback={
          <main className="px-6 py-10 text-sm text-muted-foreground">
            Loading products…
          </main>
        }
      >
        <ProductsListPage />
      </Suspense>
    </RequirePagePermission>
  );
}
