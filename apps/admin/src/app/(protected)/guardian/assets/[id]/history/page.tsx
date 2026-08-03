"use client";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { AssetHistoryPage } from "@/features/assets";
import { Permissions } from "@/features/auth/permissions";

export default function GuardianAssetHistoryPage() {
  return (
    <RequirePagePermission permission={Permissions.AST_VIEW}>
      <AssetHistoryPage />
    </RequirePagePermission>
  );
}
