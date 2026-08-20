import { apiClient } from "@/services/api-client";

import type {
  OrderActivity,
  OrderDetail,
  OrderItem,
  OrderListResponse,
  OrderNote,
  OrderStatus,
  OrderStatusHistory,
  OrderType,
  UpdateCrmOrderPayload,
} from "../types";

type ApiEnvelope<T> = {
  data: T;
  meta: { correlationId: string };
};

export async function listCrmOrders(params?: {
  q?: string;
  status?: OrderStatus | "ALL";
  orderType?: OrderType | "ALL";
  patientUserId?: string;
  createdFrom?: string;
  createdTo?: string;
  skip?: number;
  take?: number;
}): Promise<OrderListResponse> {
  const { data } = await apiClient.get<ApiEnvelope<OrderListResponse>>(
    "/v1/crm/orders",
    { params },
  );
  return data.data;
}

export async function getCrmOrder(id: string): Promise<OrderDetail> {
  const { data } = await apiClient.get<ApiEnvelope<OrderDetail>>(
    `/v1/crm/orders/${id}`,
  );
  return data.data;
}

export async function getCrmOrderItems(id: string): Promise<OrderItem[]> {
  const { data } = await apiClient.get<ApiEnvelope<OrderItem[]>>(
    `/v1/crm/orders/${id}/items`,
  );
  return data.data;
}

export async function updateCrmOrder(
  id: string,
  payload: UpdateCrmOrderPayload,
): Promise<Partial<OrderDetail>> {
  const { data } = await apiClient.patch<ApiEnvelope<Partial<OrderDetail>>>(
    `/v1/crm/orders/${id}`,
    payload,
  );
  return data.data;
}

export async function cancelCrmOrder(
  id: string,
  reason?: string,
): Promise<Partial<OrderDetail>> {
  const { data } = await apiClient.post<ApiEnvelope<Partial<OrderDetail>>>(
    `/v1/crm/orders/${id}/cancel`,
    { reason },
  );
  return data.data;
}

export async function fulfillCrmOrder(
  id: string,
  payload?: { trackingNumber?: string; carrier?: string; reason?: string },
): Promise<Partial<OrderDetail>> {
  const { data } = await apiClient.post<ApiEnvelope<Partial<OrderDetail>>>(
    `/v1/crm/orders/${id}/fulfill`,
    payload ?? {},
  );
  return data.data;
}

export async function listCrmOrderNotes(id: string): Promise<OrderNote[]> {
  const { data } = await apiClient.get<ApiEnvelope<OrderNote[]>>(
    `/v1/crm/orders/${id}/notes`,
  );
  return data.data;
}

export async function addCrmOrderNote(
  id: string,
  body: string,
): Promise<OrderNote> {
  const { data } = await apiClient.post<ApiEnvelope<OrderNote>>(
    `/v1/crm/orders/${id}/notes`,
    { body },
  );
  return data.data;
}

export async function listCrmOrderHistory(
  id: string,
): Promise<OrderStatusHistory[]> {
  const { data } = await apiClient.get<ApiEnvelope<OrderStatusHistory[]>>(
    `/v1/crm/orders/${id}/history`,
  );
  return data.data;
}

export async function listCrmOrderActivity(
  id: string,
): Promise<OrderActivity[]> {
  const { data } = await apiClient.get<ApiEnvelope<OrderActivity[]>>(
    `/v1/crm/orders/${id}/activity`,
  );
  return data.data;
}
