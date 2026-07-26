import { Permissions, type PermissionCode } from "@/features/auth/permissions";

export type NavItem = {
  href: string;
  label: string;
  permission?: PermissionCode;
};

/**
 * Navigation affordances filtered by permission (docs/08 screen matrix).
 * Target pages may be placeholders until domain modules land.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", permission: Permissions.CRM_ACCESS_SHELL },
  {
    href: "/settings",
    label: "Settings",
    permission: Permissions.SET_MANAGE,
  },
  {
    href: "/users",
    label: "Users",
    permission: Permissions.ADM_MANAGE_USERS,
  },
  {
    href: "/reports",
    label: "Reports",
    permission: Permissions.RPT_VIEW,
  },
];
