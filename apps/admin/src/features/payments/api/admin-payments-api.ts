import { apiClient } from "@/services/api-client";

import type {
  PaymentDetail,
  PaymentListResponse,
  ProviderConfig,
} from "../types";
import type { SavedPaymentMethod } from "@/features/users/types";

type ApiEnvelope<T> = {
  data: T;
  meta: { correlationId: string };
};

export async function listAdminPayments(params?: {
  q?: string;
  status?: string;
  provider?: string;
  skip?: number;
  take?: number;
}): Promise<PaymentListResponse> {
  const { data } = await apiClient.get<ApiEnvelope<PaymentListResponse>>(
    "/v1/admin/payments",
    { params },
  );
  return data.data;
}

export async function getAdminPayment(id: string): Promise<PaymentDetail> {
  const { data } = await apiClient.get<ApiEnvelope<PaymentDetail>>(
    `/v1/admin/payments/${id}`,
  );
  return data.data;
}

export async function initiateAdminRefund(
  paymentId: string,
  payload: { amountCents: number; reason: string },
  idempotencyKey: string,
): Promise<unknown> {
  const { data } = await apiClient.post(
    `/v1/admin/payments/${paymentId}/refunds`,
    payload,
    { headers: { "Idempotency-Key": idempotencyKey } },
  );
  return data.data;
}

export async function getAdminPaymentProviders(): Promise<ProviderConfig> {
  const { data } = await apiClient.get<ApiEnvelope<ProviderConfig>>(
    "/v1/admin/payment-providers",
  );
  return data.data;
}

export async function listAdminPaymentMethods(
  userId: string,
): Promise<SavedPaymentMethod[]> {
  const { data } = await apiClient.get<ApiEnvelope<SavedPaymentMethod[]>>(
    `/v1/admin/users/${userId}/payment-methods`,
  );
  return data.data;
}

export async function addAdminPaymentMethod(
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
    `/v1/admin/users/${userId}/payment-methods`,
    payload,
  );
  return data.data;
}

export async function updateAdminPaymentMethod(
  userId: string,
  methodId: string,
  payload: { brand?: string; expMonth?: number; expYear?: number },
): Promise<SavedPaymentMethod> {
  const { data } = await apiClient.patch<ApiEnvelope<SavedPaymentMethod>>(
    `/v1/admin/users/${userId}/payment-methods/${methodId}`,
    payload,
  );
  return data.data;
}

export async function makeAdminPaymentMethodDefault(
  userId: string,
  methodId: string,
): Promise<SavedPaymentMethod> {
  const { data } = await apiClient.post<ApiEnvelope<SavedPaymentMethod>>(
    `/v1/admin/users/${userId}/payment-methods/${methodId}/default`,
    {},
  );
  return data.data;
}

export async function deleteAdminPaymentMethod(
  userId: string,
  methodId: string,
): Promise<SavedPaymentMethod> {
  const { data } = await apiClient.delete<ApiEnvelope<SavedPaymentMethod>>(
    `/v1/admin/users/${userId}/payment-methods/${methodId}`,
  );
  return data.data;
}
