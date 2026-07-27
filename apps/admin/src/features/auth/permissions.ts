/**
 * Permission and role codes mirroring the API RBAC constants (docs/08).
 * Single source of truth for admin UI authorization checks.
 */
export const Permissions = {
  CRM_ACCESS_SHELL: "PERM-CRM-020",
  CRM_APPROVE_RX: "PERM-CRM-002",
  CRM_PHARMACY_REVIEW: "PERM-CRM-006",
  CRM_PHARMACY_READY: "PERM-CRM-007",
  ORD_VIEW: "PERM-ORD-001",
  QST_VIEW_FULL_ANSWERS: "PERM-QST-003",
  QST_CONFIGURE: "PERM-QST-004",
  ADM_MANAGE_USERS: "PERM-ADM-001",
  ADM_ASSIGN_ROLES: "PERM-ADM-002",
  ADM_CONFIGURE_WORKFLOWS: "PERM-ADM-003",
  ADM_VIEW_AUDIT: "PERM-ADM-010",
  ADM_ACCESS_ADMINISTRATION: "PERM-ADM-020",
  SET_MANAGE: "PERM-SET-001",
  RPT_VIEW: "PERM-RPT-001",
  ANL_OPS_CLINICAL: "PERM-ANL-002",
} as const;

export type PermissionCode =
  (typeof Permissions)[keyof typeof Permissions];

export const Roles = {
  PATIENT: "ROLE-002",
  DOCTOR: "ROLE-003",
  PHARMACIST: "ROLE-004",
  SUPPORT: "ROLE-005",
  OPERATIONS: "ROLE-006",
  MARKETING: "ROLE-007",
  CONTENT: "ROLE-008",
  ADMINISTRATOR: "ROLE-009",
  SUPER_ADMINISTRATOR: "ROLE-010",
} as const;

export type RoleCode = (typeof Roles)[keyof typeof Roles];
