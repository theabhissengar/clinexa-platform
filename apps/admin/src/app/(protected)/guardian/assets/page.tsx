"use client";

import { Suspense } from "react";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { AssetsListPage } from "@/features/assets";
import { Permissions } from "@/features/auth/permissions";

export default function GuardianAssetsPage() {
  return (
    <RequirePagePermission permission={Permissions.AST_VIEW}>
      <Suspense
        fallback={
          <main className="px-6 py-10 text-sm text-muted-foreground">
            Loading assets…
          </main>
        }
      >
        <AssetsListPage />
      </Suspense>
    </RequirePagePermission>
  );
}
