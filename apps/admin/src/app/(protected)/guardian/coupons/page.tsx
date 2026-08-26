"use client";

import { Suspense } from "react";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { GuardianCouponsListPage } from "@/features/coupons/components/guardian-coupons-list-page";

export default function GuardianCouponsPage() {
  return (
    <RequirePagePermission permission={Permissions.CPN_CONFIGURE}>
      <Suspense fallback={<main className="px-6 py-10">Loading…</main>}>
        <GuardianCouponsListPage />
      </Suspense>
    </RequirePagePermission>
  );
}
