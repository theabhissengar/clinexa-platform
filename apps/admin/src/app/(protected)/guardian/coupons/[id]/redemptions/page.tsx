"use client";

import { Suspense } from "react";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { GuardianCouponRedemptionsPage } from "@/features/coupons/components/guardian-coupon-redemptions-page";

export default function GuardianCouponRedemptionsRoutePage() {
  return (
    <RequirePagePermission permission={Permissions.CPN_CONFIGURE}>
      <Suspense fallback={<main className="px-6 py-10">Loading…</main>}>
        <GuardianCouponRedemptionsPage />
      </Suspense>
    </RequirePagePermission>
  );
}
