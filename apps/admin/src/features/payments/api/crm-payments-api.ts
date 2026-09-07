import { apiClient } from "@/services/api-client";

import type { SavedPaymentMethod } from "@/features/users/types";

type ApiEnvelope<T> = {
  data: T;
  meta: { correlationId: string };
};

export async function listCrmPaymentMethods(
  userId: string,
): Promise<SavedPaymentMethod[]> {
  const { data } = await apiClient.get<ApiEnvelope<SavedPaymentMethod[]>>(
    `/v1/crm/users/${userId}/payment-methods`,
  );
  return data.data;
}

export async function addCrmPaymentMethod(
  userId: string,
  payload: {
    brand?: string;
    last4?: string;
    expMonth?: number;
    expYear?: number;
    isDefault?: boolean;
  },
): Promise<SavedPaymentMethod> {
  const { data } = await apiClient.post<ApiEnvelope<SavedPaymentMethod>>(
    `/v1/crm/users/${userId}/payment-methods`,
    payload,
  );
  return data.data;
}

export async function updateCrmPaymentMethod(
  userId: string,
  methodId: string,
  payload: { brand?: string; expMonth?: number; expYear?: number },
): Promise<SavedPaymentMethod> {
  const { data } = await apiClient.patch<ApiEnvelope<SavedPaymentMethod>>(
    `/v1/crm/users/${userId}/payment-methods/${methodId}`,
    payload,
  );
  return data.data;
}

export async function makeCrmPaymentMethodDefault(
  userId: string,
  methodId: string,
): Promise<SavedPaymentMethod> {
  const { data } = await apiClient.post<ApiEnvelope<SavedPaymentMethod>>(
    `/v1/crm/users/${userId}/payment-methods/${methodId}/default`,
    {},
  );
  return data.data;
}

export async function deleteCrmPaymentMethod(
  userId: string,
  methodId: string,
): Promise<SavedPaymentMethod> {
  const { data } = await apiClient.delete<ApiEnvelope<SavedPaymentMethod>>(
    `/v1/crm/users/${userId}/payment-methods/${methodId}`,
  );
  return data.data;
}

export async function initiateCrmRefund(
  paymentId: string,
  payload: { amountCents: number; reason: string },
  idempotencyKey: string,
): Promise<unknown> {
  const { data } = await apiClient.post<ApiEnvelope<unknown>>(
    `/v1/crm/payments/${paymentId}/refunds`,
    payload,
    { headers: { "Idempotency-Key": idempotencyKey } },
  );
  return data.data;
}
