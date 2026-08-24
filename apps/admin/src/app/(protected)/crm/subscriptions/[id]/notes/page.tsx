"use client";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { CrmSubscriptionNotesPage } from "@/features/subscriptions/components/crm-subscription-notes-page";

export default function CrmSubscriptionNotesRoutePage() {
  return (
    <RequirePagePermission permission={Permissions.SUB_VIEW}>
      <CrmSubscriptionNotesPage />
    </RequirePagePermission>
  );
}
