"use client";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { AssetDetailPage } from "@/features/assets";
import { Permissions } from "@/features/auth/permissions";

export default function GuardianAssetDetailPage() {
  return (
    <RequirePagePermission permission={Permissions.AST_VIEW}>
      <AssetDetailPage />
    </RequirePagePermission>
  );
}
