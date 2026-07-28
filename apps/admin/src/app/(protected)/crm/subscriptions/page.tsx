"use client";

import { Repeat } from "lucide-react";

import { ModuleComingSoon } from "@/components/layout/module-coming-soon";
import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";

/**
 * CRM Subscriptions — View / Edit / Create (operational).
 * Delete, Archive, Restore remain Guardian-only.
 */
export default function CrmSubscriptionsPage() {
  return (
    <RequirePagePermission
      permission={[
        Permissions.SUB_ASSIST_RENEWAL,
        Permissions.SUB_CONFIGURE_PLANS,
      ]}
    >
      <ModuleComingSoon
        title="Subscriptions"
        description="Operational subscription assist: view, edit, and create where product rules allow. Delete, archive, and restore are Guardian-only."
        icon={Repeat}
      />
    </RequirePagePermission>
  );
}
