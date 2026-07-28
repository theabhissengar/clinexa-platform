import {
  Permissions,
  Roles,
  type PermissionCode,
  type RoleCode,
} from "@/features/auth/permissions";
import { LEGACY_PATH_REDIRECTS } from "@/lib/legacy-redirects";

export { LEGACY_PATH_REDIRECTS };
export const PlatformContexts = {
  CRM: "crm",
  GUARDIAN: "guardian",
} as const;

export type PlatformContext =
  (typeof PlatformContexts)[keyof typeof PlatformContexts];

export const CONTEXT_PREFIX: Record<PlatformContext, `/${PlatformContext}`> = {
  crm: "/crm",
  guardian: "/guardian",
};

export const CONTEXT_LABEL: Record<PlatformContext, string> = {
  crm: "CRM",
  guardian: "Guardian",
};

export const CONTEXT_SHELL_PERMISSION: Record<PlatformContext, PermissionCode> =
  {
    crm: Permissions.CRM_ACCESS_SHELL,
    guardian: Permissions.GRD_ACCESS_SHELL,
  };

export const CONTEXT_LANDING: Record<PlatformContext, string> = {
  crm: "/crm",
  guardian: "/guardian",
};

/** Roles that prefer Guardian as the default post-login context (NAV-107). */
const GUARDIAN_DEFAULT_ROLES: ReadonlySet<string> = new Set<RoleCode>([
  Roles.ADMINISTRATOR,
  Roles.SUPER_ADMINISTRATOR,
  Roles.MARKETING,
  Roles.CONTENT,
]);

/**
 * Resolves the active platform context from a pathname.
 * Returns null for context-neutral routes (login, forbidden, …).
 */
export function resolveContextFromPathname(
  pathname: string,
): PlatformContext | null {
  if (pathname === "/crm" || pathname.startsWith("/crm/")) {
    return PlatformContexts.CRM;
  }
  if (pathname === "/guardian" || pathname.startsWith("/guardian/")) {
    return PlatformContexts.GUARDIAN;
  }
  return null;
}

export function canAccessContext(
  context: PlatformContext,
  can: (permission: PermissionCode | string) => boolean,
): boolean {
  return can(CONTEXT_SHELL_PERMISSION[context]);
}

/**
 * Role-based default landing (NAV-107–109).
 * Deep links override this when authorized (NAV-110) — callers decide.
 */
export function resolveDefaultLanding(options: {
  can: (permission: PermissionCode | string) => boolean;
  roles: readonly string[];
}): string | null {
  const { can, roles } = options;
  const hasCrm = can(Permissions.CRM_ACCESS_SHELL);
  const hasGuardian = can(Permissions.GRD_ACCESS_SHELL);

  if (!hasCrm && !hasGuardian) {
    return null;
  }
  if (hasGuardian && !hasCrm) {
    return CONTEXT_LANDING.guardian;
  }
  if (hasCrm && !hasGuardian) {
    return CONTEXT_LANDING.crm;
  }

  const prefersGuardian = roles.some((role) =>
    GUARDIAN_DEFAULT_ROLES.has(role),
  );
  return prefersGuardian ? CONTEXT_LANDING.guardian : CONTEXT_LANDING.crm;
}
