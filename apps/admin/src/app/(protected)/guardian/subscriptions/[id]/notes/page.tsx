"use client";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { GuardianSubscriptionNotesPage } from "@/features/subscriptions/components/guardian-subscription-notes-page";

export default function GuardianSubscriptionNotesRoutePage() {
  return (
    <RequirePagePermission permission={Permissions.SUB_VIEW}>
      <GuardianSubscriptionNotesPage />
    </RequirePagePermission>
  );
}
