"use client";

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

import {
  Permissions,
  type PermissionCode,
  type RoleCode,
} from "@/features/auth/permissions";
import { useAuth } from "@/providers/auth-provider";

type PermissionContextValue = {
  roles: string[];
  permissions: string[];
  can: (permission: PermissionCode | string) => boolean;
  canAll: (permissions: readonly (PermissionCode | string)[]) => boolean;
  canAny: (permissions: readonly (PermissionCode | string)[]) => boolean;
  hasRole: (role: RoleCode | string) => boolean;
  hasCrmShellAccess: boolean;
  hasGuardianShellAccess: boolean;
};

const PermissionContext = createContext<PermissionContextValue | null>(null);

type PermissionProviderProps = {
  children: ReactNode;
};

export function PermissionProvider({ children }: PermissionProviderProps) {
  const { user } = useAuth();

  const value = useMemo<PermissionContextValue>(() => {
    const roles = user?.roles ?? [];
    const permissions = user?.permissions ?? [];
    const permissionSet = new Set(permissions);
    const roleSet = new Set(roles);

    const can = (permission: PermissionCode | string) =>
      permissionSet.has(permission);

    return {
      roles,
      permissions,
      can,
      canAll: (required) => required.every((p) => permissionSet.has(p)),
      canAny: (required) => required.some((p) => permissionSet.has(p)),
      hasRole: (role) => roleSet.has(role),
      hasCrmShellAccess: can(Permissions.CRM_ACCESS_SHELL),
      hasGuardianShellAccess: can(Permissions.GRD_ACCESS_SHELL),
    };
  }, [user]);

  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  );
}

export function usePermissionContext(): PermissionContextValue {
  const context = useContext(PermissionContext);
  if (!context) {
    throw new Error("usePermissionContext must be used within PermissionProvider");
  }
  return context;
}
