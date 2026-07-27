/**
 * Product role codes (docs/08 ROLE-002–010). Single source of truth.
 * Guest (ROLE-001) is unauthenticated and not persisted.
 * ROLE-010 is a normal RBAC role — never bypasses AuthN/AuthZ/guards.
 */
export const Roles = {
  PATIENT: 'ROLE-002',
  DOCTOR: 'ROLE-003',
  PHARMACIST: 'ROLE-004',
  SUPPORT: 'ROLE-005',
  OPERATIONS: 'ROLE-006',
  MARKETING: 'ROLE-007',
  CONTENT: 'ROLE-008',
  ADMINISTRATOR: 'ROLE-009',
  SUPER_ADMINISTRATOR: 'ROLE-010',
} as const;

export type RoleCode = (typeof Roles)[keyof typeof Roles];

export const RoleSlugs = {
  [Roles.PATIENT]: 'patient',
  [Roles.DOCTOR]: 'doctor',
  [Roles.PHARMACIST]: 'pharmacist',
  [Roles.SUPPORT]: 'support',
  [Roles.OPERATIONS]: 'operations',
  [Roles.MARKETING]: 'marketing',
  [Roles.CONTENT]: 'content',
  [Roles.ADMINISTRATOR]: 'administrator',
  [Roles.SUPER_ADMINISTRATOR]: 'super-administrator',
} as const;

export const RoleNames = {
  [Roles.PATIENT]: 'Patient',
  [Roles.DOCTOR]: 'Doctor',
  [Roles.PHARMACIST]: 'Pharmacist',
  [Roles.SUPPORT]: 'Support',
  [Roles.OPERATIONS]: 'Operations',
  [Roles.MARKETING]: 'Marketing',
  [Roles.CONTENT]: 'Content',
  [Roles.ADMINISTRATOR]: 'Administrator',
  [Roles.SUPER_ADMINISTRATOR]: 'Super Administrator',
} as const;
