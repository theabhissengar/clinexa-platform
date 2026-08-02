export type UserStatus =
  | "PENDING_VERIFICATION"
  | "ACTIVE"
  | "SUSPENDED"
  | "INACTIVE"
  | "ARCHIVED"
  | "DELETED";

export type UserGender = "MALE" | "FEMALE" | "OTHER" | "UNSPECIFIED";

export type UserRoleRef = {
  code: string;
  name: string;
  slug: string;
};

export type StaffProfileRef = {
  id: string;
  title: string | null;
  credentialsDisplay: string | null;
  department: string | null;
  crmPreferences: Record<string, unknown> | null;
} | null;

export type AddressSnapshot = {
  line1?: string;
  line2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
};

export type AdminUser = {
  id: string;
  email: string;
  status: UserStatus;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  phone: string | null;
  bio: string | null;
  avatarMediaAssetId: string | null;
  dateOfBirth: string | null;
  gender: UserGender;
  region: string | null;
  healthCardMediaAssetId: string | null;
  billingAddress: AddressSnapshot | null;
  shippingAddress: AddressSnapshot | null;
  stripeCustomerIdLive: string | null;
  stripeCustomerIdTest: string | null;
  preferences: Record<string, unknown> | null;
  internalNotes: string | null;
  emailVerifiedAt: string | null;
  lastActiveAt: string | null;
  archivedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  tokenVersion: number;
  roles: UserRoleRef[];
  staffProfile: StaffProfileRef;
  securitySummary: {
    failedLoginCount: number;
    lockedUntil: string | null;
    twoFactorStatus: "unknown";
  };
};

export type OperationalUser = {
  id: string;
  email: string;
  status: UserStatus;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  phone: string | null;
  gender: UserGender;
  region: string | null;
  dateOfBirth: string | null;
  billingAddress: AddressSnapshot | null;
  shippingAddress: AddressSnapshot | null;
  internalNotes: string | null;
  roles: UserRoleRef[];
  createdAt: string;
  updatedAt: string;
  lastActiveAt: string | null;
};

export type UserStatusCounts = Partial<Record<UserStatus | "ALL", number>>;

export type UserRoleCounts = Record<string, number>;

export type AdminUserListResponse = {
  items: AdminUser[];
  total: number;
  statusCounts?: UserStatusCounts;
  roleCounts?: UserRoleCounts;
};

export type CrmUserListResponse = {
  items: OperationalUser[];
  total: number;
};

export type CreateStaffUserPayload = {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  phone?: string;
  roleCodes?: string[];
  staffProfile?: {
    title?: string;
    credentialsDisplay?: string;
    department?: string;
  };
};

export type UpdateUserAdminPayload = {
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  phone?: string | null;
  bio?: string | null;
  avatarMediaAssetId?: string | null;
  dateOfBirth?: string | null;
  gender?: UserGender;
  region?: string | null;
  healthCardMediaAssetId?: string | null;
  billingAddress?: AddressSnapshot | null;
  shippingAddress?: AddressSnapshot | null;
  stripeCustomerIdLive?: string | null;
  stripeCustomerIdTest?: string | null;
  preferences?: Record<string, unknown> | null;
  internalNotes?: string | null;
  staffProfile?: {
    title?: string;
    credentialsDisplay?: string;
    department?: string;
    crmPreferences?: Record<string, unknown>;
  } | null;
};

export type UpdateUserOperationalPayload = {
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  phone?: string | null;
  dateOfBirth?: string | null;
  gender?: UserGender;
  region?: string | null;
  internalNotes?: string | null;
  billingAddress?: AddressSnapshot | null;
  shippingAddress?: AddressSnapshot | null;
};

export type UserHistoryEntry = {
  id: string;
  userId: string;
  actorId: string | null;
  action: string;
  changes: unknown;
  createdAt: string;
};

export type UserActivityEntry = {
  id: string;
  userId: string;
  actorId: string | null;
  kind: string;
  summary: string;
  metadata: unknown;
  createdAt: string;
};

export type Permission = {
  id: string;
  code: string;
  module: string;
  name: string;
  description: string | null;
  resource: string | null;
  action: string | null;
};

export type Role = {
  id: string;
  code: string;
  slug: string;
  name: string;
  description: string | null;
  permissionCodes: string[];
  assignedUserCount: number;
  createdAt: string;
  updatedAt: string;
};
