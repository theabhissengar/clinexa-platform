import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ChartColumn,
  ClipboardList,
  FileText,
  Image,
  LayoutDashboard,
  Newspaper,
  Package,
  Repeat,
  Settings,
  Shield,
  ShoppingCart,
  Tags,
  Users,
} from "lucide-react";

import {
  Permissions,
  type PermissionCode,
  type RoleCode,
} from "@/features/auth/permissions";
import type { PlatformContext } from "@/lib/platform-context";

/**
 * Navigation catalog — single source of truth for sidebar + breadcrumbs.
 * Filtering order: context → permission → hidden/flag → sort (NAV-031).
 * Shared modules appear in both contexts; actions differ by context (Ownership Matrix).
 * Future modules: add an entry here + a protected page under the context prefix.
 */
export type NavGroupKey =
  | "dashboard"
  | "commerce"
  | "content"
  | "users"
  | "marketing"
  | "platform"
  | "security"
  | "developer"
  | "analytics"
  | "support";

export type NavItem = {
  key: string;
  title: string;
  route: string;
  icon: LucideIcon;
  context: PlatformContext;
  group?: NavGroupKey;
  parent?: string;
  permission?: PermissionCode | readonly PermissionCode[];
  role?: RoleCode;
  badge?: string | number;
  order: number;
  hidden?: boolean;
  disabled?: boolean;
  featureFlag?: string;
};

/** Guardian group order (NAV-060). Prescriptions and Questionnaires are CRM-only. */
export const GUARDIAN_GROUP_ORDER: readonly NavGroupKey[] = [
  "dashboard",
  "commerce",
  "users",
  "content",
  "marketing",
  "platform",
  "security",
  "developer",
  "support",
] as const;

export const GUARDIAN_GROUP_LABEL: Record<NavGroupKey, string> = {
  dashboard: "Dashboard",
  commerce: "Commerce",
  content: "Content",
  users: "Users",
  marketing: "Marketing",
  platform: "Platform",
  security: "Security",
  developer: "Developer",
  analytics: "Analytics",
  support: "Support",
};

/**
 * Foundation catalog — context-prefixed placeholders only.
 * Shared (both contexts): Users, Orders, Subscriptions.
 * CRM-only: Prescriptions, Questionnaires, Reports.
 * CRM = operational actions; Guardian = administrative (+ destructive later).
 */
export const NAV_ITEMS: NavItem[] = [
  // ── CRM (operational, flat list) ──────────────────────────────────────────
  {
    key: "crm-dashboard",
    title: "Dashboard",
    route: "/crm",
    icon: LayoutDashboard,
    context: "crm",
    permission: Permissions.CRM_ACCESS_SHELL,
    order: 10,
  },
  {
    key: "crm-users",
    title: "Users",
    route: "/crm/users",
    icon: Users,
    context: "crm",
    permission: [
      Permissions.CRM_PATIENT_RECORDS,
      Permissions.ADM_MANAGE_USERS,
    ],
    order: 20,
  },
  {
    key: "crm-orders",
    title: "Orders",
    route: "/crm/orders",
    icon: ShoppingCart,
    context: "crm",
    permission: Permissions.ORD_VIEW,
    order: 30,
  },
  {
    key: "crm-subscriptions",
    title: "Subscriptions",
    route: "/crm/subscriptions",
    icon: Repeat,
    context: "crm",
    permission: [
      Permissions.SUB_ASSIST_RENEWAL,
      Permissions.SUB_CONFIGURE_PLANS,
    ],
    order: 40,
  },
  {
    key: "crm-prescriptions",
    title: "Prescriptions",
    route: "/crm/prescriptions",
    icon: FileText,
    context: "crm",
    permission: [
      Permissions.CRM_APPROVE_RX,
      Permissions.CRM_PHARMACY_REVIEW,
      Permissions.CRM_PHARMACY_READY,
    ],
    order: 50,
  },
  {
    key: "crm-questionnaires",
    title: "Questionnaires",
    route: "/crm/questionnaires",
    icon: ClipboardList,
    context: "crm",
    permission: [
      Permissions.QST_VIEW_FULL_ANSWERS,
      Permissions.QST_CONFIGURE,
    ],
    order: 60,
  },
  {
    key: "crm-reports",
    title: "Reports",
    route: "/crm/reports",
    icon: ChartColumn,
    context: "crm",
    permission: Permissions.RPT_VIEW,
    order: 70,
  },
  {
    key: "crm-activity-log",
    title: "Activity Log",
    route: "/crm/activity-log",
    icon: Activity,
    context: "crm",
    permission: [
      Permissions.ANL_OPS_CLINICAL,
      Permissions.ADM_VIEW_AUDIT,
      Permissions.ORD_VIEW,
    ],
    order: 80,
  },

  // ── Guardian (administrative, grouped) ────────────────────────────────────
  {
    key: "guardian-dashboard",
    title: "Dashboard",
    route: "/guardian",
    icon: LayoutDashboard,
    context: "guardian",
    group: "dashboard",
    permission: Permissions.GRD_ACCESS_SHELL,
    order: 10,
  },
  // Commerce
  {
    key: "guardian-products",
    title: "Products",
    route: "/guardian/products",
    icon: Package,
    context: "guardian",
    group: "commerce",
    permission: Permissions.PRD_MANAGE,
    order: 20,
  },
  {
    key: "guardian-categories",
    title: "Categories",
    route: "/guardian/categories",
    icon: Tags,
    context: "guardian",
    group: "commerce",
    permission: Permissions.CAT_MANAGE,
    order: 25,
  },
  {
    key: "guardian-orders",
    title: "Orders",
    route: "/guardian/orders",
    icon: ShoppingCart,
    context: "guardian",
    group: "commerce",
    permission: Permissions.ORD_VIEW,
    order: 30,
  },
  {
    key: "guardian-subscriptions",
    title: "Subscriptions",
    route: "/guardian/subscriptions",
    icon: Repeat,
    context: "guardian",
    group: "commerce",
    permission: [
      Permissions.SUB_CONFIGURE_PLANS,
      Permissions.SUB_ASSIST_RENEWAL,
    ],
    order: 40,
  },
  // Users
  {
    key: "guardian-users",
    title: "Users",
    route: "/guardian/users",
    icon: Users,
    context: "guardian",
    group: "users",
    permission: Permissions.ADM_MANAGE_USERS,
    order: 50,
  },
  // Content
  {
    key: "guardian-blogs",
    title: "Blogs",
    route: "/guardian/blogs",
    icon: Newspaper,
    context: "guardian",
    group: "content",
    permission: Permissions.BLG_MANAGE,
    order: 60,
  },
  {
    key: "guardian-pages",
    title: "Pages",
    route: "/guardian/pages",
    icon: FileText,
    context: "guardian",
    group: "content",
    permission: Permissions.CMS_MANAGE,
    order: 70,
  },
  {
    key: "guardian-media",
    title: "Media",
    route: "/guardian/media",
    icon: Image,
    context: "guardian",
    group: "content",
    permission: Permissions.CMS_MANAGE,
    order: 80,
  },
  // Platform
  {
    key: "guardian-activity-log",
    title: "Activity Log",
    route: "/guardian/activity-log",
    icon: Activity,
    context: "guardian",
    group: "platform",
    permission: Permissions.ADM_VIEW_AUDIT,
    order: 90,
  },
  {
    key: "guardian-settings",
    title: "Settings",
    route: "/guardian/settings",
    icon: Settings,
    context: "guardian",
    group: "platform",
    permission: Permissions.SET_MANAGE,
    order: 100,
  },
  {
    key: "guardian-administration",
    title: "Administration",
    route: "/guardian/administration",
    icon: Shield,
    context: "guardian",
    group: "platform",
    permission: Permissions.ADM_ACCESS_ADMINISTRATION,
    order: 110,
  },
];
