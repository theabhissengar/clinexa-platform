import { apiClient } from "@/services/api-client";

type ApiEnvelope<T> = {
  data: T;
  meta: { correlationId: string };
};

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
