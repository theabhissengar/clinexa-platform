import { apiClient } from "@/services/api-client";

import type {
  InventoryBalanceRow,
  InventoryDashboard,
  InventoryPolicy,
  StockMovement,
  Warehouse,
} from "../types";

type ApiEnvelope<T> = {
  data: T;
  meta: { correlationId: string };
};

export async function getInventoryDashboard(): Promise<InventoryDashboard> {
  const { data } = await apiClient.get<ApiEnvelope<InventoryDashboard>>(
    "/v1/admin/inventory/dashboard",
  );
  return data.data;
}

export async function listBalances(params?: {
  q?: string;
  lowStockOnly?: boolean;
  skip?: number;
  take?: number;
}): Promise<{
  items: InventoryBalanceRow[];
  total: number;
  warehouseId: string;
}> {
  const { data } = await apiClient.get<
    ApiEnvelope<{
      items: InventoryBalanceRow[];
      total: number;
      warehouseId: string;
    }>
  >("/v1/admin/inventory/balances", { params });
  return data.data;
}

export async function getBalance(variantId: string) {
  const { data } = await apiClient.get<ApiEnvelope<InventoryBalanceRow>>(
    `/v1/admin/inventory/balances/${variantId}`,
  );
  return data.data;
}

export async function adjustStock(payload: {
  productVariantId: string;
  quantityDelta: number;
  reason: string;
}) {
  const { data } = await apiClient.post("/v1/admin/inventory/adjustments", payload);
  return data.data;
}

export async function receiveStock(payload: {
  productVariantId: string;
  quantity: number;
  reason?: string;
}) {
  const { data } = await apiClient.post("/v1/admin/inventory/receiving", payload);
  return data.data;
}

export async function listWarehouses(): Promise<Warehouse[]> {
  const { data } = await apiClient.get<ApiEnvelope<Warehouse[]>>(
    "/v1/admin/inventory/warehouses",
  );
  return data.data;
}

export async function createWarehouse(payload: { code: string; name: string }) {
  const { data } = await apiClient.post<ApiEnvelope<Warehouse>>(
    "/v1/admin/inventory/warehouses",
    payload,
  );
  return data.data;
}

export async function updateWarehouse(
  id: string,
  payload: { name?: string; status?: "ACTIVE" | "INACTIVE" },
) {
  const { data } = await apiClient.patch<ApiEnvelope<Warehouse>>(
    `/v1/admin/inventory/warehouses/${id}`,
    payload,
  );
  return data.data;
}

export async function getPolicies(): Promise<InventoryPolicy> {
  const { data } = await apiClient.get<ApiEnvelope<InventoryPolicy>>(
    "/v1/admin/inventory/policies",
  );
  return data.data;
}

export async function updatePolicies(
  payload: Partial<InventoryPolicy>,
): Promise<InventoryPolicy> {
  const { data } = await apiClient.patch<ApiEnvelope<InventoryPolicy>>(
    "/v1/admin/inventory/policies",
    payload,
  );
  return data.data;
}

export async function listMovements(params?: {
  productVariantId?: string;
  skip?: number;
  take?: number;
}): Promise<{ items: StockMovement[]; total: number }> {
  const { data } = await apiClient.get<
    ApiEnvelope<{ items: StockMovement[]; total: number }>
  >("/v1/admin/inventory/movements", { params });
  return data.data;
}

export async function purgeZeroBalances(dryRun: boolean) {
  const { data } = await apiClient.post("/v1/admin/inventory/purge", {
    dryRun,
  });
  return data.data;
}
