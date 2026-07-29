import { apiClient } from "@/services/api-client";

import type {
  Category,
  CategoryListResponse,
  CreateCategoryPayload,
} from "@/features/products/types";

type ApiEnvelope<T> = {
  data: T;
  meta: { correlationId: string };
};

export async function listAdminCategories(params?: {
  q?: string;
  skip?: number;
  take?: number;
}): Promise<CategoryListResponse> {
  const { data } = await apiClient.get<ApiEnvelope<CategoryListResponse>>(
    "/v1/admin/categories",
    { params },
  );
  return data.data;
}

export async function getAdminCategory(id: string): Promise<Category> {
  const { data } = await apiClient.get<ApiEnvelope<Category>>(
    `/v1/admin/categories/${id}`,
  );
  return data.data;
}

export async function createCategory(
  payload: CreateCategoryPayload,
): Promise<Category> {
  const { data } = await apiClient.post<ApiEnvelope<Category>>(
    "/v1/admin/categories",
    payload,
  );
  return data.data;
}

export async function updateCategory(
  id: string,
  payload: Partial<CreateCategoryPayload>,
): Promise<Category> {
  const { data } = await apiClient.patch<ApiEnvelope<Category>>(
    `/v1/admin/categories/${id}`,
    payload,
  );
  return data.data;
}

export async function publishCategory(id: string): Promise<Category> {
  const { data } = await apiClient.post<ApiEnvelope<Category>>(
    `/v1/admin/categories/${id}/publish`,
  );
  return data.data;
}

export async function unpublishCategory(id: string): Promise<Category> {
  const { data } = await apiClient.post<ApiEnvelope<Category>>(
    `/v1/admin/categories/${id}/unpublish`,
  );
  return data.data;
}

export async function deleteCategory(id: string): Promise<void> {
  await apiClient.delete(`/v1/admin/categories/${id}`);
}
