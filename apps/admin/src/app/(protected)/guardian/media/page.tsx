"use client";

import { Image } from "lucide-react";

import { ModuleComingSoon } from "@/components/layout/module-coming-soon";
import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";

export default function GuardianMediaPage() {
  return (
    <RequirePagePermission permission={Permissions.CMS_MANAGE}>
      <ModuleComingSoon
        title="Media"
        description="Media library administration placeholder. Asset management ships in a later phase."
        icon={Image}
      />
    </RequirePagePermission>
  );
}
