import { apiClient } from "@/services/api-client";

import type {
  CreateAdminSubscriptionPayload,
  SubscriptionActivity,
  SubscriptionDetail,
  SubscriptionHistoryResponse,
  SubscriptionListResponse,
  SubscriptionNote,
  SubscriptionRenewalAttempt,
  SubscriptionStatus,
  UpdateAdminSubscriptionPayload,
} from "../types";

type ApiEnvelope<T> = {
  data: T;
  meta: { correlationId: string };
};

export async function listAdminSubscriptions(params?: {
  q?: string;
  status?: SubscriptionStatus | "ALL";
  planId?: string;
  patientUserId?: string;
  nextRenewalFrom?: string;
  nextRenewalTo?: string;
  createdFrom?: string;
  createdTo?: string;
  includeDeleted?: boolean;
  archived?: "ACTIVE" | "ARCHIVED" | "ALL";
  skip?: number;
  take?: number;
}): Promise<SubscriptionListResponse> {
  const { data } = await apiClient.get<ApiEnvelope<SubscriptionListResponse>>(
    "/v1/admin/subscriptions",
    { params },
  );
  return data.data;
}

export async function getAdminSubscription(
  id: string,
  includeDeleted = false,
): Promise<SubscriptionDetail> {
  const { data } = await apiClient.get<ApiEnvelope<SubscriptionDetail>>(
    `/v1/admin/subscriptions/${id}`,
    { params: includeDeleted ? { includeDeleted: true } : undefined },
  );
  return data.data;
}

export async function createAdminSubscription(
  payload: CreateAdminSubscriptionPayload,
): Promise<SubscriptionDetail> {
  const { data } = await apiClient.post<ApiEnvelope<SubscriptionDetail>>(
    "/v1/admin/subscriptions",
    payload,
  );
  return data.data;
}

export async function updateAdminSubscription(
  id: string,
  payload: UpdateAdminSubscriptionPayload,
): Promise<Partial<SubscriptionDetail>> {
  const { data } = await apiClient.patch<
    ApiEnvelope<Partial<SubscriptionDetail>>
  >(`/v1/admin/subscriptions/${id}`, payload);
  return data.data;
}

export async function pauseAdminSubscription(id: string, reason?: string) {
  const { data } = await apiClient.post<
    ApiEnvelope<Partial<SubscriptionDetail>>
  >(`/v1/admin/subscriptions/${id}/pause`, { reason });
  return data.data;
}

export async function resumeAdminSubscription(id: string, reason?: string) {
  const { data } = await apiClient.post<
    ApiEnvelope<Partial<SubscriptionDetail>>
  >(`/v1/admin/subscriptions/${id}/resume`, { reason });
  return data.data;
}

export async function cancelAdminSubscription(id: string, reason?: string) {
  const { data } = await apiClient.post<
    ApiEnvelope<Partial<SubscriptionDetail>>
  >(`/v1/admin/subscriptions/${id}/cancel`, { reason });
  return data.data;
}

export async function activateAdminSubscription(id: string, reason?: string) {
  const { data } = await apiClient.post<
    ApiEnvelope<Partial<SubscriptionDetail>>
  >(`/v1/admin/subscriptions/${id}/activate`, { reason });
  return data.data;
}

export async function deleteAdminSubscription(id: string, reason?: string) {
  const { data } = await apiClient.post(
    `/v1/admin/subscriptions/${id}/delete`,
    { reason },
  );
  return data.data;
}

export async function archiveAdminSubscription(id: string, reason?: string) {
  const { data } = await apiClient.post(
    `/v1/admin/subscriptions/${id}/archive`,
    { reason },
  );
  return data.data;
}

export async function restoreAdminSubscription(id: string, reason?: string) {
  const { data } = await apiClient.post(
    `/v1/admin/subscriptions/${id}/restore`,
    { reason },
  );
  return data.data;
}

export async function correctAdminSubscription(
  id: string,
  payload: {
    reason: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
  },
) {
  const { data } = await apiClient.post(
    `/v1/admin/subscriptions/${id}/corrections`,
    payload,
  );
  return data.data;
}

export async function overrideAdminSubscription(
  id: string,
  payload: { toStatus: SubscriptionStatus; reason: string },
) {
  const { data } = await apiClient.post(
    `/v1/admin/subscriptions/${id}/overrides`,
    payload,
  );
  return data.data;
}

export async function listAdminSubscriptionRenewals(
  id: string,
): Promise<SubscriptionRenewalAttempt[]> {
  const { data } = await apiClient.get<
    ApiEnvelope<SubscriptionRenewalAttempt[]>
  >(`/v1/admin/subscriptions/${id}/renewals`);
  return data.data;
}

export async function openAdminManualRenewal(id: string) {
  const { data } = await apiClient.post(
    `/v1/admin/subscriptions/${id}/renewals`,
    {},
  );
  return data.data;
}

export async function retryAdminRenewalAttempt(id: string, attemptId: string) {
  const { data } = await apiClient.post(
    `/v1/admin/subscriptions/${id}/renewals/${attemptId}/retry`,
    {},
  );
  return data.data;
}

export async function listAdminSubscriptionNotes(
  id: string,
): Promise<SubscriptionNote[]> {
  const { data } = await apiClient.get<ApiEnvelope<SubscriptionNote[]>>(
    `/v1/admin/subscriptions/${id}/notes`,
  );
  return data.data;
}

export async function addAdminSubscriptionNote(
  id: string,
  body: string,
): Promise<SubscriptionNote> {
  const { data } = await apiClient.post<ApiEnvelope<SubscriptionNote>>(
    `/v1/admin/subscriptions/${id}/notes`,
    { body },
  );
  return data.data;
}

export async function listAdminSubscriptionHistory(
  id: string,
): Promise<SubscriptionHistoryResponse> {
  const { data } = await apiClient.get<
    ApiEnvelope<SubscriptionHistoryResponse>
  >(`/v1/admin/subscriptions/${id}/history`);
  return data.data;
}

export async function listAdminSubscriptionActivity(
  id: string,
): Promise<SubscriptionActivity[]> {
  const { data } = await apiClient.get<ApiEnvelope<SubscriptionActivity[]>>(
    `/v1/admin/subscriptions/${id}/activity`,
  );
  return data.data;
}
