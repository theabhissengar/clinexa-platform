import { apiClient } from "@/services/api-client";

import type {
  AuthTokensResponse,
  LoginCredentials,
  SessionResponse,
} from "../types";

type ApiEnvelope<T> = {
  data: T;
  meta: { correlationId: string };
};

export async function loginRequest(
  credentials: LoginCredentials,
): Promise<AuthTokensResponse> {
  const { data } = await apiClient.post<ApiEnvelope<AuthTokensResponse>>(
    "/v1/auth/login",
    credentials,
  );
  return data.data;
}

export async function refreshRequest(): Promise<AuthTokensResponse> {
  const { data } = await apiClient.post<ApiEnvelope<AuthTokensResponse>>(
    "/v1/auth/refresh",
  );
  return data.data;
}

export async function logoutRequest(): Promise<void> {
  await apiClient.post("/v1/auth/logout");
}

export async function getSessionRequest(): Promise<SessionResponse> {
  const { data } = await apiClient.get<ApiEnvelope<SessionResponse>>(
    "/v1/auth/session",
  );
  return data.data;
}
