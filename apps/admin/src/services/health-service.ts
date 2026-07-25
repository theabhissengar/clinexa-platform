import { apiClient } from "@/services/api-client";

export type HealthResponse = {
  status: string;
  service: string;
  timestamp: string;
};

/**
 * Foundation-only health probe against the Backend API.
 * Remove or relocate when real domain services are introduced.
 */
export async function getApiHealth(): Promise<HealthResponse> {
  const { data } = await apiClient.get<HealthResponse>("/health");
  return data;
}
