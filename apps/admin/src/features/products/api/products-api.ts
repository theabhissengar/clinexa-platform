import { apiClient } from "@/services/api-client";

import type {
  CreateProductPayload,
  Product,
  ProductLifecycleStatus,
  ProductListResponse,
  ProductType,
} from "../types";

type ApiEnvelope<T> = {
  data: T;
  meta: { correlationId: string };
};

export async function listAdminProducts(params?: {
  q?: string;
  status?: ProductLifecycleStatus;
  productType?: ProductType;
  categoryId?: string;
  brandName?: string;
  skip?: number;
  take?: number;
}): Promise<ProductListResponse> {
  const { data } = await apiClient.get<ApiEnvelope<ProductListResponse>>(
    "/v1/admin/products",
    { params },
  );
  return data.data;
}

export async function getAdminProduct(id: string): Promise<Product> {
  const { data } = await apiClient.get<ApiEnvelope<Product>>(
    `/v1/admin/products/${id}`,
  );
  return data.data;
}

export async function createProduct(
  payload: CreateProductPayload,
): Promise<Product> {
  const { data } = await apiClient.post<ApiEnvelope<Product>>(
    "/v1/admin/products",
    payload,
  );
  return data.data;
}

export async function updateProduct(
  id: string,
  payload: Partial<CreateProductPayload>,
): Promise<Product> {
  const { data } = await apiClient.patch<ApiEnvelope<Product>>(
    `/v1/admin/products/${id}`,
    payload,
  );
  return data.data;
}

export async function transitionProduct(
  id: string,
  status: ProductLifecycleStatus,
): Promise<Product> {
  const { data } = await apiClient.post<ApiEnvelope<Product>>(
    `/v1/admin/products/${id}/transition`,
    { status },
  );
  return data.data;
}

export async function deleteProduct(id: string): Promise<void> {
  await apiClient.delete(`/v1/admin/products/${id}`);
}

export async function bulkDeleteProducts(ids: string[]) {
  const { data } = await apiClient.post("/v1/admin/products/bulk-delete", {
    ids,
  });
  return data.data as { results: Array<{ id: string; deleted: boolean }> };
}

export async function duplicateProduct(id: string): Promise<Product> {
  const { data } = await apiClient.post<ApiEnvelope<Product>>(
    `/v1/admin/products/${id}/duplicate`,
  );
  return data.data;
}

export async function toggleProductFeatured(id: string): Promise<Product> {
  const { data } = await apiClient.post<ApiEnvelope<Product>>(
    `/v1/admin/products/${id}/toggle-featured`,
  );
  return data.data;
}

export async function createVariant(
  productId: string,
  payload: {
    sku: string;
    label?: string;
    priceCents: number;
    salePriceCents?: number | null;
    optionValues?: Record<string, string>;
  },
) {
  const { data } = await apiClient.post(
    `/v1/admin/products/${productId}/variants`,
    payload,
  );
  return data.data;
}

export async function updateVariant(
  productId: string,
  variantId: string,
  payload: {
    sku?: string;
    label?: string;
    priceCents?: number;
    salePriceCents?: number | null;
    optionValues?: Record<string, string>;
  },
) {
  const { data } = await apiClient.patch(
    `/v1/admin/products/${productId}/variants/${variantId}`,
    payload,
  );
  return data.data;
}

export async function deleteVariant(productId: string, variantId: string) {
  await apiClient.delete(
    `/v1/admin/products/${productId}/variants/${variantId}`,
  );
}

export async function attachMedia(
  productId: string,
  payload: { mediaAssetId: string; alt?: string },
) {
  const { data } = await apiClient.post(
    `/v1/admin/products/${productId}/media`,
    payload,
  );
  return data.data;
}

export async function getProductHistory(id: string) {
  const { data } = await apiClient.get(`/v1/admin/products/${id}/history`);
  return data.data as Array<{
    id: string;
    action: string;
    changes: unknown;
    createdAt: string;
  }>;
}

export async function getProductActivity(id: string) {
  const { data } = await apiClient.get(`/v1/admin/products/${id}/activity`);
  return data.data as Array<{
    id: string;
    kind: string;
    summary: string;
    createdAt: string;
  }>;
}

export async function getProductInventorySummary(id: string) {
  const { data } = await apiClient.get(`/v1/admin/products/${id}/inventory`);
  return data.data as {
    available: boolean;
    message: string;
    variants: Array<{ variantId: string; sku: string; balance: number | null }>;
  };
}
