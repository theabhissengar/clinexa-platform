import { apiClient } from "@/services/api-client";

import type {
  AdminUser,
  AdminUserListResponse,
  CreateStaffUserPayload,
  CrmUserListResponse,
  OperationalUser,
  Permission,
  Role,
  UpdateUserAdminPayload,
  UpdateUserOperationalPayload,
  UserActivityEntry,
  UserHistoryEntry,
  UserStatus,
} from "../types";

type ApiEnvelope<T> = {
  data: T;
  meta: { correlationId: string };
};

export async function listAdminUsers(params?: {
  q?: string;
  status?: UserStatus | "ALL";
  role?: string;
  kind?: "staff" | "patient";
  skip?: number;
  take?: number;
}): Promise<AdminUserListResponse> {
  const { data } = await apiClient.get<ApiEnvelope<AdminUserListResponse>>(
    "/v1/admin/users",
    { params },
  );
  return data.data;
}

export async function getAdminUser(id: string): Promise<AdminUser> {
  const { data } = await apiClient.get<ApiEnvelope<AdminUser>>(
    `/v1/admin/users/${id}`,
  );
  return data.data;
}

export async function createStaffUser(
  payload: CreateStaffUserPayload,
): Promise<AdminUser> {
  const { data } = await apiClient.post<ApiEnvelope<AdminUser>>(
    "/v1/admin/users",
    payload,
  );
  return data.data;
}

export async function updateAdminUser(
  id: string,
  payload: UpdateUserAdminPayload,
): Promise<AdminUser> {
  const { data } = await apiClient.patch<ApiEnvelope<AdminUser>>(
    `/v1/admin/users/${id}`,
    payload,
  );
  return data.data;
}

export async function suspendUser(id: string): Promise<AdminUser> {
  const { data } = await apiClient.post<ApiEnvelope<AdminUser>>(
    `/v1/admin/users/${id}/suspend`,
  );
  return data.data;
}

export async function reactivateUser(id: string): Promise<AdminUser> {
  const { data } = await apiClient.post<ApiEnvelope<AdminUser>>(
    `/v1/admin/users/${id}/reactivate`,
  );
  return data.data;
}

export async function deactivateUser(id: string): Promise<AdminUser> {
  const { data } = await apiClient.post<ApiEnvelope<AdminUser>>(
    `/v1/admin/users/${id}/deactivate`,
  );
  return data.data;
}

export async function archiveUser(id: string): Promise<AdminUser> {
  const { data } = await apiClient.post<ApiEnvelope<AdminUser>>(
    `/v1/admin/users/${id}/archive`,
  );
  return data.data;
}

export async function restoreUser(id: string): Promise<AdminUser> {
  const { data } = await apiClient.post<ApiEnvelope<AdminUser>>(
    `/v1/admin/users/${id}/restore`,
  );
  return data.data;
}

export async function deleteUser(id: string): Promise<void> {
  await apiClient.delete(`/v1/admin/users/${id}`);
}

export async function getUserRoles(id: string): Promise<UserRoleRef[]> {
  const { data } = await apiClient.get<ApiEnvelope<UserRoleRef[]>>(
    `/v1/admin/users/${id}/roles`,
  );
  return data.data;
}

export async function replaceUserRoles(
  id: string,
  roleCodes: string[],
): Promise<AdminUser> {
  const { data } = await apiClient.put<ApiEnvelope<AdminUser>>(
    `/v1/admin/users/${id}/roles`,
    { roleCodes },
  );
  return data.data;
}

export async function getUserHistory(
  id: string,
): Promise<UserHistoryEntry[]> {
  const { data } = await apiClient.get<ApiEnvelope<UserHistoryEntry[]>>(
    `/v1/admin/users/${id}/history`,
  );
  return data.data;
}

export async function getUserActivity(
  id: string,
): Promise<UserActivityEntry[]> {
  const { data } = await apiClient.get<ApiEnvelope<UserActivityEntry[]>>(
    `/v1/admin/users/${id}/activity`,
  );
  return data.data;
}

export async function requestUserPasswordReset(id: string): Promise<void> {
  await apiClient.post(`/v1/admin/users/${id}/password-reset`);
}

export async function setUserPassword(
  id: string,
  password: string,
): Promise<void> {
  await apiClient.post(`/v1/admin/users/${id}/set-password`, { password });
}

export async function listRoles(): Promise<Role[]> {
  const { data } = await apiClient.get<ApiEnvelope<Role[]>>(
    "/v1/admin/roles",
  );
  return data.data;
}

export async function listPermissions(): Promise<Permission[]> {
  const { data } = await apiClient.get<ApiEnvelope<Permission[]>>(
    "/v1/admin/permissions",
  );
  return data.data;
}

export async function getRole(id: string): Promise<Role> {
  const { data } = await apiClient.get<ApiEnvelope<Role>>(
    `/v1/admin/roles/${id}`,
  );
  return data.data;
}

export async function setRolePermissions(
  id: string,
  permissionCodes: string[],
): Promise<Role> {
  const { data } = await apiClient.put<ApiEnvelope<Role>>(
    `/v1/admin/roles/${id}/permissions`,
    { permissionCodes },
  );
  return data.data;
}

export async function listCrmUsers(params?: {
  q?: string;
  status?: UserStatus | "ALL";
  skip?: number;
  take?: number;
}): Promise<CrmUserListResponse> {
  const { data } = await apiClient.get<ApiEnvelope<CrmUserListResponse>>(
    "/v1/crm/users",
    { params },
  );
  return data.data;
}

export async function getCrmUser(id: string): Promise<OperationalUser> {
  const { data } = await apiClient.get<ApiEnvelope<OperationalUser>>(
    `/v1/crm/users/${id}`,
  );
  return data.data;
}

export async function updateCrmUser(
  id: string,
  payload: UpdateUserOperationalPayload,
): Promise<OperationalUser> {
  const { data } = await apiClient.patch<ApiEnvelope<OperationalUser>>(
    `/v1/crm/users/${id}`,
    payload,
  );
  return data.data;
}
