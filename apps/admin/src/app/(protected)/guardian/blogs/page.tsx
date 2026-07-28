"use client";

import { Newspaper } from "lucide-react";

import { ModuleComingSoon } from "@/components/layout/module-coming-soon";
import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";

export default function GuardianBlogsPage() {
  return (
    <RequirePagePermission permission={Permissions.BLG_MANAGE}>
      <ModuleComingSoon
        title="Blogs"
        description="Blog authoring and publish administration placeholder. Content body ships in a later phase."
        icon={Newspaper}
      />
    </RequirePagePermission>
  );
}
