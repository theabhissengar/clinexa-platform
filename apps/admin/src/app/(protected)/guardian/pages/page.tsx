"use client";

import { FileText } from "lucide-react";

import { ModuleComingSoon } from "@/components/layout/module-coming-soon";
import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";

export default function GuardianPagesPage() {
  return (
    <RequirePagePermission permission={Permissions.CMS_MANAGE}>
      <ModuleComingSoon
        title="Pages"
        description="CMS pages administration placeholder. Authorship and publish flows ship in a later phase."
        icon={FileText}
      />
    </RequirePagePermission>
  );
}
