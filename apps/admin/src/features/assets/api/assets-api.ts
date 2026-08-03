import { apiClient } from "@/services/api-client";

import type {
  Asset,
  AssetActivityRow,
  AssetHistoryRow,
  AssetListResponse,
  AssetStatus,
  AssetUploadSession,
} from "../types";

type ApiEnvelope<T> = {
  data: T;
  meta: { correlationId: string };
};

export async function listAdminAssets(params?: {
  q?: string;
  status?: AssetStatus;
  skip?: number;
  take?: number;
}): Promise<AssetListResponse> {
  const { data } = await apiClient.get<ApiEnvelope<AssetListResponse>>(
    "/v1/admin/assets",
    { params },
  );
  return data.data;
}

export async function listPickerAssets(params?: {
  q?: string;
  skip?: number;
  take?: number;
}): Promise<AssetListResponse> {
  const { data } = await apiClient.get<ApiEnvelope<AssetListResponse>>(
    "/v1/admin/assets/picker",
    { params },
  );
  return data.data;
}

export async function getAdminAsset(id: string): Promise<Asset> {
  const { data } = await apiClient.get<ApiEnvelope<Asset>>(
    `/v1/admin/assets/${id}`,
  );
  return data.data;
}

export async function createUploadSession(payload: {
  originalFilename: string;
  mimeType: string;
}): Promise<AssetUploadSession> {
  const { data } = await apiClient.post<ApiEnvelope<AssetUploadSession>>(
    "/v1/admin/assets/upload-sessions",
    payload,
  );
  return data.data;
}

export async function uploadSessionContent(
  sessionId: string,
  file: File,
): Promise<{ id: string; status: string; byteSize: number }> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await apiClient.put<
    ApiEnvelope<{ id: string; status: string; byteSize: number }>
  >(`/v1/admin/assets/upload-sessions/${sessionId}/content`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data.data;
}

export async function finalizeUploadSession(sessionId: string): Promise<Asset> {
  const { data } = await apiClient.post<ApiEnvelope<Asset>>(
    `/v1/admin/assets/upload-sessions/${sessionId}/finalize`,
  );
  return data.data;
}

export async function updateAsset(
  id: string,
  payload: { altText?: string | null; caption?: string | null },
): Promise<Asset> {
  const { data } = await apiClient.patch<ApiEnvelope<Asset>>(
    `/v1/admin/assets/${id}`,
    payload,
  );
  return data.data;
}

export async function archiveAsset(id: string): Promise<Asset> {
  const { data } = await apiClient.post<ApiEnvelope<Asset>>(
    `/v1/admin/assets/${id}/archive`,
  );
  return data.data;
}

export async function restoreAsset(id: string): Promise<Asset> {
  const { data } = await apiClient.post<ApiEnvelope<Asset>>(
    `/v1/admin/assets/${id}/restore`,
  );
  return data.data;
}

export async function deleteAsset(id: string): Promise<Asset> {
  const { data } = await apiClient.delete<ApiEnvelope<Asset>>(
    `/v1/admin/assets/${id}`,
  );
  return data.data;
}

export async function bulkAssets(
  ids: string[],
  action: "archive" | "delete",
): Promise<{ results: Array<{ id: string; ok: boolean; error?: string }> }> {
  const { data } = await apiClient.post<
    ApiEnvelope<{ results: Array<{ id: string; ok: boolean; error?: string }> }>
  >("/v1/admin/assets/bulk", { ids, action });
  return data.data;
}

export async function getAssetHistory(id: string): Promise<AssetHistoryRow[]> {
  const { data } = await apiClient.get<ApiEnvelope<AssetHistoryRow[]>>(
    `/v1/admin/assets/${id}/history`,
  );
  return data.data;
}

export async function getAssetActivity(
  id: string,
): Promise<AssetActivityRow[]> {
  const { data } = await apiClient.get<ApiEnvelope<AssetActivityRow[]>>(
    `/v1/admin/assets/${id}/activity`,
  );
  return data.data;
}

export async function resolveAsset(id: string): Promise<{
  assetId: string;
  url: string;
  mimeType: string;
  altText: string | null;
}> {
  const { data } = await apiClient.get<
    ApiEnvelope<{
      assetId: string;
      url: string;
      mimeType: string;
      altText: string | null;
    }>
  >(`/v1/assets/${id}/resolve`);
  return data.data;
}
