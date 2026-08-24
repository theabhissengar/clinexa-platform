import { apiClient } from "@/services/api-client";

import type {
  SubscriptionActivity,
  SubscriptionDetail,
  SubscriptionHistoryResponse,
  SubscriptionListResponse,
  SubscriptionNote,
  SubscriptionRenewalAttempt,
  SubscriptionStatus,
  UpdateCrmSubscriptionPayload,
} from "../types";

type ApiEnvelope<T> = {
  data: T;
  meta: { correlationId: string };
};

export async function listCrmSubscriptions(params?: {
  q?: string;
  status?: SubscriptionStatus | "ALL";
  planId?: string;
  patientUserId?: string;
  nextRenewalFrom?: string;
  nextRenewalTo?: string;
  createdFrom?: string;
  createdTo?: string;
  skip?: number;
  take?: number;
}): Promise<SubscriptionListResponse> {
  const { data } = await apiClient.get<ApiEnvelope<SubscriptionListResponse>>(
    "/v1/crm/subscriptions",
    { params },
  );
  return data.data;
}

export async function getCrmSubscription(
  id: string,
): Promise<SubscriptionDetail> {
  const { data } = await apiClient.get<ApiEnvelope<SubscriptionDetail>>(
    `/v1/crm/subscriptions/${id}`,
  );
  return data.data;
}

export async function updateCrmSubscription(
  id: string,
  payload: UpdateCrmSubscriptionPayload,
): Promise<Partial<SubscriptionDetail>> {
  const { data } = await apiClient.patch<
    ApiEnvelope<Partial<SubscriptionDetail>>
  >(`/v1/crm/subscriptions/${id}`, payload);
  return data.data;
}

export async function pauseCrmSubscription(
  id: string,
  reason?: string,
): Promise<Partial<SubscriptionDetail>> {
  const { data } = await apiClient.post<
    ApiEnvelope<Partial<SubscriptionDetail>>
  >(`/v1/crm/subscriptions/${id}/pause`, { reason });
  return data.data;
}

export async function resumeCrmSubscription(
  id: string,
  reason?: string,
): Promise<Partial<SubscriptionDetail>> {
  const { data } = await apiClient.post<
    ApiEnvelope<Partial<SubscriptionDetail>>
  >(`/v1/crm/subscriptions/${id}/resume`, { reason });
  return data.data;
}

export async function cancelCrmSubscription(
  id: string,
  reason?: string,
): Promise<Partial<SubscriptionDetail>> {
  const { data } = await apiClient.post<
    ApiEnvelope<Partial<SubscriptionDetail>>
  >(`/v1/crm/subscriptions/${id}/cancel`, { reason });
  return data.data;
}

export async function listCrmSubscriptionRenewals(
  id: string,
): Promise<SubscriptionRenewalAttempt[]> {
  const { data } = await apiClient.get<
    ApiEnvelope<SubscriptionRenewalAttempt[]>
  >(`/v1/crm/subscriptions/${id}/renewals`);
  return data.data;
}

export async function openCrmManualRenewal(
  id: string,
): Promise<unknown> {
  const { data } = await apiClient.post<ApiEnvelope<unknown>>(
    `/v1/crm/subscriptions/${id}/renewals`,
    {},
  );
  return data.data;
}

export async function retryCrmRenewalAttempt(
  id: string,
  attemptId: string,
): Promise<unknown> {
  const { data } = await apiClient.post<ApiEnvelope<unknown>>(
    `/v1/crm/subscriptions/${id}/renewals/${attemptId}/retry`,
    {},
  );
  return data.data;
}

export async function listCrmSubscriptionNotes(
  id: string,
): Promise<SubscriptionNote[]> {
  const { data } = await apiClient.get<ApiEnvelope<SubscriptionNote[]>>(
    `/v1/crm/subscriptions/${id}/notes`,
  );
  return data.data;
}

export async function addCrmSubscriptionNote(
  id: string,
  body: string,
): Promise<SubscriptionNote> {
  const { data } = await apiClient.post<ApiEnvelope<SubscriptionNote>>(
    `/v1/crm/subscriptions/${id}/notes`,
    { body },
  );
  return data.data;
}

export async function listCrmSubscriptionHistory(
  id: string,
): Promise<SubscriptionHistoryResponse> {
  const { data } = await apiClient.get<
    ApiEnvelope<SubscriptionHistoryResponse>
  >(`/v1/crm/subscriptions/${id}/history`);
  return data.data;
}

export async function listCrmSubscriptionActivity(
  id: string,
): Promise<SubscriptionActivity[]> {
  const { data } = await apiClient.get<ApiEnvelope<SubscriptionActivity[]>>(
    `/v1/crm/subscriptions/${id}/activity`,
  );
  return data.data;
}
