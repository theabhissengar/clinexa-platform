import { apiClient } from "@/services/api-client";

import type {
  CreateSubscriptionPlanPayload,
  SubscriptionPlan,
  SubscriptionPlanListResponse,
  SubscriptionPlanStatus,
  UpdateSubscriptionPlanPayload,
} from "../types";

type ApiEnvelope<T> = {
  data: T;
  meta: { correlationId: string };
};

export async function listAdminSubscriptionPlans(params?: {
  q?: string;
  status?: SubscriptionPlanStatus | "ALL";
  includeDeleted?: boolean;
  archived?: "ACTIVE" | "ARCHIVED" | "ALL";
  skip?: number;
  take?: number;
}): Promise<SubscriptionPlanListResponse> {
  const { data } = await apiClient.get<
    ApiEnvelope<SubscriptionPlanListResponse>
  >("/v1/admin/subscription-plans", { params });
  return data.data;
}

export async function getAdminSubscriptionPlan(
  id: string,
  includeDeleted = false,
): Promise<SubscriptionPlan> {
  const { data } = await apiClient.get<ApiEnvelope<SubscriptionPlan>>(
    `/v1/admin/subscription-plans/${id}`,
    { params: includeDeleted ? { includeDeleted: true } : undefined },
  );
  return data.data;
}

export async function createAdminSubscriptionPlan(
  payload: CreateSubscriptionPlanPayload,
): Promise<SubscriptionPlan> {
  const { data } = await apiClient.post<ApiEnvelope<SubscriptionPlan>>(
    "/v1/admin/subscription-plans",
    payload,
  );
  return data.data;
}

export async function updateAdminSubscriptionPlan(
  id: string,
  payload: UpdateSubscriptionPlanPayload,
): Promise<SubscriptionPlan> {
  const { data } = await apiClient.patch<ApiEnvelope<SubscriptionPlan>>(
    `/v1/admin/subscription-plans/${id}`,
    payload,
  );
  return data.data;
}

export async function publishAdminSubscriptionPlan(id: string) {
  const { data } = await apiClient.post(
    `/v1/admin/subscription-plans/${id}/publish`,
    {},
  );
  return data.data as SubscriptionPlan;
}

export async function unpublishAdminSubscriptionPlan(id: string) {
  const { data } = await apiClient.post(
    `/v1/admin/subscription-plans/${id}/unpublish`,
    {},
  );
  return data.data as SubscriptionPlan;
}

export async function archiveAdminSubscriptionPlan(id: string) {
  const { data } = await apiClient.post(
    `/v1/admin/subscription-plans/${id}/archive`,
    {},
  );
  return data.data as SubscriptionPlan;
}

export async function restoreAdminSubscriptionPlan(id: string) {
  const { data } = await apiClient.post(
    `/v1/admin/subscription-plans/${id}/restore`,
    {},
  );
  return data.data as SubscriptionPlan;
}
