"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import type { PermissionCode } from "@/features/auth/permissions";
import { usePermissions } from "@/features/auth/hooks/use-permissions";

type RequirePagePermissionProps = {
  permission: PermissionCode | readonly PermissionCode[];
  children: ReactNode;
};

/**
 * Client page gate — redirects to /forbidden when permission is missing.
 */
export function RequirePagePermission({
  permission,
  children,
}: RequirePagePermissionProps) {
  const { can, canAny } = usePermissions();
  const router = useRouter();
  const allowed =
    typeof permission === "string"
      ? can(permission)
      : canAny(permission);

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
