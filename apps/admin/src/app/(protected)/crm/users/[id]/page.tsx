"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { CrmUserDetailPage } from "@/features/users/components/crm-user-detail-page";

function CrmUserDetailInner() {
  const searchParams = useSearchParams();
  const section = searchParams.get("section") ?? "profile";

  return (
    <RequirePagePermission
      permission={[
        Permissions.CRM_PATIENT_RECORDS,
        Permissions.ADM_MANAGE_USERS,
      ]}
    >
      <CrmUserDetailPage sectionSlug={section} />
    </RequirePagePermission>
  );
}

export default function CrmUserDetailRoutePage() {
  return (
    <Suspense fallback={<main className="px-6 py-10">Loading…</main>}>
      <CrmUserDetailInner />
    </Suspense>
  );
}
