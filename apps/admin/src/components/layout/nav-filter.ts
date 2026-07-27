import type { NavItem } from "@/components/layout/nav-config";
import type { PermissionCode } from "@/features/auth/permissions";

type CanFn = (permission: PermissionCode | string) => boolean;
type CanAnyFn = (permissions: readonly (PermissionCode | string)[]) => boolean;

/**
 * Filters and sorts navigation from the configuration catalog.
 * Permission-driven only — no role special-casing.
 */
export function filterNavItems(
  items: readonly NavItem[],
  can: CanFn,
  canAny: CanAnyFn,
): NavItem[] {
  return items
    .filter((item) => {
      if (item.hidden) {
        return false;
      }
      if (!item.permission) {
        return true;
      }
      if (typeof item.permission === "string") {
        return can(item.permission);
      }
      return canAny(item.permission);
    })
    .slice()
    .sort((a, b) => a.order - b.order);
}

export function isNavItemActive(pathname: string, route: string): boolean {
  if (route === "/") {
    return pathname === "/";
  }
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function findNavItemByPath(
  items: readonly NavItem[],
  pathname: string,
): NavItem | undefined {
  const sorted = items
    .slice()
    .sort((a, b) => b.route.length - a.route.length);
  return sorted.find((item) => isNavItemActive(pathname, item.route));
}
