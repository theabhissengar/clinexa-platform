"use client";

import type { ReactNode } from "react";

import type { PermissionCode } from "@/features/auth/permissions";
import { usePermissions } from "@/features/auth/hooks/use-permissions";

type RequirePermissionProps = {
  permission: PermissionCode | string;
  children: ReactNode;
  fallback?: ReactNode;
};

/**
 * UI-only gate. Server AuthZ remains authoritative.
 */
export function RequirePermission({
  permission,
  children,
  fallback = null,
}: RequirePermissionProps) {
  const { can } = usePermissions();
  if (!can(permission)) {
    return fallback;
  }
  return children;
}
