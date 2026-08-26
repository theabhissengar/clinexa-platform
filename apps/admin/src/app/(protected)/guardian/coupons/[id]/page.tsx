"use client";

import { Suspense } from "react";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { GuardianCouponDetailPage } from "@/features/coupons/components/guardian-coupon-detail-page";

export default function GuardianCouponDetailRoutePage() {
  return (
    <RequirePagePermission permission={Permissions.CPN_CONFIGURE}>
      <Suspense fallback={<main className="px-6 py-10">Loading…</main>}>
        <GuardianCouponDetailPage />
      </Suspense>
    </RequirePagePermission>
  );
}
