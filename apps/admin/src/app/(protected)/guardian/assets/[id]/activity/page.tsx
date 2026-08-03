"use client";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { AssetActivityPage } from "@/features/assets";
import { Permissions } from "@/features/auth/permissions";

export default function GuardianAssetActivityPage() {
  return (
    <RequirePagePermission permission={Permissions.AST_VIEW}>
      <AssetActivityPage />
    </RequirePagePermission>
  );
}
