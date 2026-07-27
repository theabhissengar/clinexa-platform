import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ChartColumn,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Settings,
  Shield,
  ShoppingCart,
  Users,
} from "lucide-react";

import {
  Permissions,
  type PermissionCode,
  type RoleCode,
} from "@/features/auth/permissions";

/**
 * Navigation catalog — single source of truth for sidebar + breadcrumbs.
 * Future modules: add an entry here + a protected page. Do not edit AppSidebar.
 *
 * Administrator (ROLE-009) must receive matrix grants for every business module
 * so items are not hidden by default. Super Administrator adds PERM-ADM-020 only.
 */
export type NavItem = {
  title: string;
  route: string;
  icon: LucideIcon;
  permission?: PermissionCode | readonly PermissionCode[];
  role?: RoleCode;
  badge?: string | number;
  category?: string;
  order: number;
  hidden?: boolean;
  disabled?: boolean;
  featureFlag?: string;
};

export const NAV_ITEMS: NavItem[] = [
  {
    title: "Dashboard",
    route: "/",
    icon: LayoutDashboard,
    permission: Permissions.CRM_ACCESS_SHELL,
    order: 10,
  },
  {
    title: "Users",
    route: "/users",
    icon: Users,
    permission: Permissions.ADM_MANAGE_USERS,
    order: 20,
  },
  {
    title: "Orders",
    route: "/orders",
    icon: ShoppingCart,
    permission: Permissions.ORD_VIEW,
    order: 30,
  },
  {
    title: "Prescriptions",
    route: "/prescriptions",
    icon: FileText,
    permission: [
      Permissions.CRM_APPROVE_RX,
      Permissions.CRM_PHARMACY_REVIEW,
      Permissions.CRM_PHARMACY_READY,
    ],
    order: 40,
  },
  {
    title: "Questionnaires",
    route: "/questionnaires",
    icon: ClipboardList,
    permission: [
      Permissions.QST_VIEW_FULL_ANSWERS,
      Permissions.QST_CONFIGURE,
    ],
    order: 50,
  },
  {
    title: "Activity Log",
    route: "/activity-log",
    icon: Activity,
    permission: Permissions.ADM_VIEW_AUDIT,
    order: 60,
  },
  {
    title: "Reports",
    route: "/reports",
    icon: ChartColumn,
    permission: Permissions.RPT_VIEW,
    order: 70,
  },
  {
    title: "Settings",
    route: "/settings",
    icon: Settings,
    permission: Permissions.SET_MANAGE,
    order: 80,
  },
  {
    title: "Administration",
    route: "/administration",
    icon: Shield,
    permission: Permissions.ADM_ACCESS_ADMINISTRATION,
    order: 90,
  },
];
