import {
  GUARDIAN_GROUP_LABEL,
  GUARDIAN_GROUP_ORDER,
  type NavGroupKey,
  type NavItem,
} from "@/components/layout/nav-config";
import type { PermissionCode } from "@/features/auth/permissions";
import type { PlatformContext } from "@/lib/platform-context";

type CanFn = (permission: PermissionCode | string) => boolean;
type CanAnyFn = (permissions: readonly (PermissionCode | string)[]) => boolean;

function passesPermission(
  item: NavItem,
  can: CanFn,
  canAny: CanAnyFn,
): boolean {
  if (!item.permission) {
    return true;
  }
  if (typeof item.permission === "string") {
    return can(item.permission);
  }
  return canAny(item.permission);
}

/**
 * Filters and sorts navigation from the configuration catalog.
 * Order: context → permission → hidden → sort (NAV-031).
 * Permission-driven only — no role special-casing.
 */
export function filterNavItems(
  items: readonly NavItem[],
  options: {
    context: PlatformContext;
    can: CanFn;
    canAny: CanAnyFn;
  },
): NavItem[] {
  const { context, can, canAny } = options;

  return items
    .filter((item) => {
      if (item.context !== context) {
        return false;
      }
      if (item.hidden) {
        return false;
      }
      return passesPermission(item, can, canAny);
    })
    .slice()
    .sort((a, b) => a.order - b.order);
}

export function isNavItemActive(pathname: string, route: string): boolean {
  if (route === "/crm" || route === "/guardian") {
    return pathname === route;
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

export type NavGroupSection = {
  key: NavGroupKey;
  label: string;
  items: NavItem[];
};

/**
 * Groups visible Guardian nav items. Empty groups are omitted (NAV-048).
 * Ungrouped items (should not happen in Guardian) form a synthetic section.
 */
export function groupNavItems(items: readonly NavItem[]): NavGroupSection[] {
  const byGroup = new Map<NavGroupKey | "ungrouped", NavItem[]>();

  for (const item of items) {
    const key = item.group ?? "ungrouped";
    const list = byGroup.get(key) ?? [];
    list.push(item);
    byGroup.set(key, list);
  }

  const sections: NavGroupSection[] = [];

  for (const groupKey of GUARDIAN_GROUP_ORDER) {
    const groupItems = byGroup.get(groupKey);
    if (!groupItems || groupItems.length === 0) {
      continue;
    }
    sections.push({
      key: groupKey,
      label: GUARDIAN_GROUP_LABEL[groupKey],
      items: groupItems,
    });
  }

  const ungrouped = byGroup.get("ungrouped");
  if (ungrouped && ungrouped.length > 0) {
    sections.push({
      key: "platform",
      label: "More",
      items: ungrouped,
    });
  }

  return sections;
}
