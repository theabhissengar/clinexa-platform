import { apiClient } from "@/services/api-client";

import type {
  PaymentDetail,
  PaymentListResponse,
  ProviderConfig,
} from "../types";

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
