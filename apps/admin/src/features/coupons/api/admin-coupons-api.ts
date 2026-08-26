import { apiClient } from "@/services/api-client";

import type {
  Coupon,
  CouponListResponse,
  CouponRedemptionListResponse,
  CreateCouponPayload,
  UpdateCouponPayload,
} from "../types";

type ApiEnvelope<T> = {
  data: T;
  meta: { correlationId: string };
};

export async function listAdminCoupons(params?: {
  q?: string;
  isActive?: boolean;
  skip?: number;
  take?: number;
}): Promise<CouponListResponse> {
  const { data } = await apiClient.get<ApiEnvelope<CouponListResponse>>(
    "/v1/admin/coupons",
    { params },
  );
  return data.data;
}

export async function getAdminCoupon(id: string): Promise<Coupon> {
  const { data } = await apiClient.get<ApiEnvelope<Coupon>>(
    `/v1/admin/coupons/${id}`,
  );
  return data.data;
}

export async function createAdminCoupon(
  payload: CreateCouponPayload,
): Promise<Coupon> {
  const { data } = await apiClient.post<ApiEnvelope<Coupon>>(
    "/v1/admin/coupons",
    payload,
  );
  return data.data;
}

export async function updateAdminCoupon(
  id: string,
  payload: UpdateCouponPayload,
): Promise<Coupon> {
  const { data } = await apiClient.patch<ApiEnvelope<Coupon>>(
    `/v1/admin/coupons/${id}`,
    payload,
  );
  return data.data;
}

export async function deactivateAdminCoupon(id: string): Promise<Coupon> {
  const { data } = await apiClient.post<ApiEnvelope<Coupon>>(
    `/v1/admin/coupons/${id}/deactivate`,
    {},
  );
  return data.data;
}

export async function deleteAdminCoupon(id: string): Promise<unknown> {
  const { data } = await apiClient.post(`/v1/admin/coupons/${id}/delete`, {});
  return data.data;
}

export async function listAdminCouponRedemptions(
  id: string,
  params?: { skip?: number; take?: number },
): Promise<CouponRedemptionListResponse> {
  const { data } = await apiClient.get<
    ApiEnvelope<CouponRedemptionListResponse>
  >(`/v1/admin/coupons/${id}/redemptions`, { params });
  return data.data;
}
