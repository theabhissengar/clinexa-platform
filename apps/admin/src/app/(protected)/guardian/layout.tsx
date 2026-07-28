"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { Permissions } from "@/features/auth/permissions";
import { usePermissions } from "@/features/auth/hooks/use-permissions";

/**
 * Guardian context guard — `/guardian/*` requires PERM-GRD-001 (NAV-010, GRD-076).
 */
export default function GuardianContextLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { can } = usePermissions();
  const router = useRouter();
  const allowed = can(Permissions.GRD_ACCESS_SHELL);

  useEffect(() => {
    if (!allowed) {
      router.replace("/forbidden");
    }
  }, [allowed, router]);

  if (!allowed) {
    return null;
  }

  return children;
}
