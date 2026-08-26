"use client";

import { Suspense } from "react";

import { RequirePagePermission } from "@/components/auth/require-page-permission";
import { Permissions } from "@/features/auth/permissions";
import { GuardianCouponFormPage } from "@/features/coupons/components/guardian-coupon-form-page";

export default function GuardianCouponNewPage() {
  return (
    <RequirePagePermission permission={Permissions.CPN_CONFIGURE}>
      <Suspense fallback={<main className="px-6 py-10">Loading…</main>}>
        <GuardianCouponFormPage mode="create" />
      </Suspense>
    </RequirePagePermission>
  );
}
