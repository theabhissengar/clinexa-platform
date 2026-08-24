"use client";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { GuardianSubscriptionPlanEditorPage } from "@/features/subscriptions/components/guardian-subscription-plan-editor-page";

export default function GuardianSubscriptionPlanEditPage() {
  return (
    <RequirePagePermission permission={Permissions.SUB_CONFIGURE_PLANS}>
      <GuardianSubscriptionPlanEditorPage mode="edit" />
    </RequirePagePermission>
  );
}
