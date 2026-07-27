"use client";

import { ClipboardList } from "lucide-react";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { ModuleComingSoon } from "@/components/layout/module-coming-soon";
import { Permissions } from "@/features/auth/permissions";

export default function QuestionnairesPage() {
  return (
    <RequirePagePermission
      permission={[
        Permissions.QST_VIEW_FULL_ANSWERS,
        Permissions.QST_CONFIGURE,
      ]}
    >
      <ModuleComingSoon
        title="Questionnaires"
        description="Questionnaires management will be delivered in a future phase."
        icon={ClipboardList}
      />
    </RequirePagePermission>
  );
}
