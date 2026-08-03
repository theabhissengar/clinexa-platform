"use client";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { AssetUploadPage } from "@/features/assets";
import { Permissions } from "@/features/auth/permissions";

export default function GuardianAssetUploadPage() {
  return (
    <RequirePagePermission permission={Permissions.AST_MANAGE}>
      <AssetUploadPage />
    </RequirePagePermission>
  );
}
