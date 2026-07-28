"use client";

import { ClipboardList } from "lucide-react";

import { ModuleComingSoon } from "@/components/layout/module-coming-soon";
import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";

/**
 * CRM Questionnaires — CRM-only Internal Platform surface.
 * Covers clinician case view and definition/configuration (no Guardian nav).
 */
export default function CrmQuestionnairesPage() {
  return (
    <RequirePagePermission
      permission={[
        Permissions.QST_VIEW_FULL_ANSWERS,
        Permissions.QST_CONFIGURE,
      ]}
    >
      <ModuleComingSoon
        title="Questionnaires"
        description="CRM-only module: clinician case views and questionnaire definition/configuration. Not exposed in Guardian."
        icon={ClipboardList}
      />
    </RequirePagePermission>
  );
}
