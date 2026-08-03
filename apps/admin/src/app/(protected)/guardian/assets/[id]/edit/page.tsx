"use client";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { AssetEditPage } from "@/features/assets";
import { Permissions } from "@/features/auth/permissions";

export default function GuardianAssetEditPage() {
  return (
    <RequirePagePermission permission={Permissions.AST_MANAGE}>
      <AssetEditPage />
    </RequirePagePermission>
  );
}
