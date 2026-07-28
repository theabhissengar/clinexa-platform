"use client";

import { Repeat } from "lucide-react";

import { ModuleComingSoon } from "@/components/layout/module-coming-soon";
import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";

/**
 * Guardian Subscriptions — View / Edit / Create / Delete / Archive / Restore.
 */
export default function GuardianSubscriptionsPage() {
  return (
    <RequirePagePermission
      permission={[
        Permissions.SUB_CONFIGURE_PLANS,
        Permissions.SUB_ASSIST_RENEWAL,
      ]}
    >
      <ModuleComingSoon
        title="Subscriptions"
        description="Administrative subscription and plan management. Delete, archive, and restore will be exposed here only, gated by Class D permissions."
        icon={Repeat}
      />
    </RequirePagePermission>
  );
}
