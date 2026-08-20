import { apiClient } from "@/services/api-client";

import type {
  CreateAdminOrderPayload,
  OrderActivity,
  OrderDetail,
  OrderListResponse,
  OrderNote,
  OrderStatus,
  OrderStatusHistory,
  OrderType,
  UpdateAdminOrderPayload,
} from "../types";

type ApiEnvelope<T> = {
  data: T;
  meta: { correlationId: string };
};

export async function listAdminOrders(params?: {
  q?: string;
  status?: OrderStatus | "ALL";
  orderType?: OrderType | "ALL";
  patientUserId?: string;
  createdFrom?: string;
  createdTo?: string;
  includeDeleted?: boolean;
  archived?: "ACTIVE" | "ARCHIVED" | "ALL";
  skip?: number;
  take?: number;
}): Promise<OrderListResponse> {
  const { data } = await apiClient.get<ApiEnvelope<OrderListResponse>>(
    "/v1/admin/orders",
    { params },
  );
  return data.data;
}

export async function getAdminOrder(
  id: string,
  includeDeleted = false,
): Promise<OrderDetail> {
  const { data } = await apiClient.get<ApiEnvelope<OrderDetail>>(
    `/v1/admin/orders/${id}`,
    { params: includeDeleted ? { includeDeleted: true } : undefined },
  );
  return data.data;
}

export async function createAdminOrder(
  payload: CreateAdminOrderPayload,
): Promise<OrderDetail> {
  const { data } = await apiClient.post<ApiEnvelope<OrderDetail>>(
    "/v1/admin/orders",
    payload,
  );
  return data.data;
}

export async function updateAdminOrder(
  id: string,
  payload: UpdateAdminOrderPayload,
): Promise<Partial<OrderDetail>> {
  const { data } = await apiClient.patch<ApiEnvelope<Partial<OrderDetail>>>(
    `/v1/admin/orders/${id}`,
    payload,
  );
  return data.data;
}

export async function deleteAdminOrder(
  id: string,
  reason?: string,
): Promise<unknown> {
  const { data } = await apiClient.post(`/v1/admin/orders/${id}/delete`, {
    reason,
  });
  return data.data;
}

export async function archiveAdminOrder(
  id: string,
  reason?: string,
): Promise<unknown> {
  const { data } = await apiClient.post(`/v1/admin/orders/${id}/archive`, {
    reason,
  });
  return data.data;
}

export async function restoreAdminOrder(
  id: string,
  reason?: string,
): Promise<unknown> {
  const { data } = await apiClient.post(`/v1/admin/orders/${id}/restore`, {
    reason,
  });
  return data.data;
}

export async function correctAdminOrder(
  id: string,
  payload: { amountCents: number; reason?: string; kind?: string },
): Promise<unknown> {
  const { data } = await apiClient.post(
    `/v1/admin/orders/${id}/corrections`,
    payload,
  );
  return data.data;
}

export async function overrideAdminOrder(
  id: string,
  payload: { toStatus: OrderStatus; reason: string },
): Promise<unknown> {
  const { data } = await apiClient.post(
    `/v1/admin/orders/${id}/overrides`,
    payload,
  );
  return data.data;
}

export async function transitionAdminOrder(
  id: string,
  payload: { toStatus: OrderStatus; reason?: string },
): Promise<unknown> {
  const { data } = await apiClient.post(
    `/v1/admin/orders/${id}/transitions`,
    payload,
  );
  return data.data;
}

export async function listAdminOrderNotes(id: string): Promise<OrderNote[]> {
  const { data } = await apiClient.get<ApiEnvelope<OrderNote[]>>(
    `/v1/admin/orders/${id}/notes`,
  );
  return data.data;
}

export async function addAdminOrderNote(
  id: string,
  body: string,
): Promise<OrderNote> {
  const { data } = await apiClient.post<ApiEnvelope<OrderNote>>(
    `/v1/admin/orders/${id}/notes`,
    { body },
  );
  return data.data;
}

export async function listAdminOrderHistory(
  id: string,
): Promise<OrderStatusHistory[]> {
  const { data } = await apiClient.get<ApiEnvelope<OrderStatusHistory[]>>(
    `/v1/admin/orders/${id}/history`,
  );
  return data.data;
}

export async function listAdminOrderActivity(
  id: string,
): Promise<OrderActivity[]> {
  const { data } = await apiClient.get<ApiEnvelope<OrderActivity[]>>(
    `/v1/admin/orders/${id}/activity`,
  );
  return data.data;
}
