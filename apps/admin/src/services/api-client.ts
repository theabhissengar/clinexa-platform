import axios, {
  type AxiosError,
  type InternalAxiosRequestConfig,
} from "axios";

import { publicEnv } from "@/config/env";

type RetriableConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
};

type TokenHandlers = {
  getAccessToken: () => string | null;
  setAccessToken: (token: string) => void;
  onUnauthorized: () => void;
};

let tokenHandlers: TokenHandlers | null = null;
let refreshPromise: Promise<string | null> | null = null;

/**
 * Registers in-memory access-token handlers (wired by AuthProvider).
 */
export function registerAuthHandlers(handlers: TokenHandlers): void {
  tokenHandlers = handlers;
}

/**
 * Shared Axios instance for Backend API calls.
 */
export const apiClient = axios.create({
  baseURL: publicEnv.apiBaseUrl,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30_000,
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  const token = tokenHandlers?.getAccessToken() ?? null;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = axios
      .post<{ data: { accessToken: string } }>(
        `${publicEnv.apiBaseUrl}/v1/auth/refresh`,
        null,
        { withCredentials: true, timeout: 30_000 },
      )
      .then((response) => {
        const token = response.data.data.accessToken;
        tokenHandlers?.setAccessToken(token);
        return token;
      })
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;
    const status = error.response?.status;
    const url = original?.url ?? "";

    const isAuthEntry =
      url.includes("/v1/auth/login") || url.includes("/v1/auth/refresh");

    if (status !== 401 || !original || original._retry || isAuthEntry) {
      return Promise.reject(error);
    }

    original._retry = true;
    const newToken = await refreshAccessToken();

    if (!newToken) {
      tokenHandlers?.onUnauthorized();
      return Promise.reject(error);
    }

    original.headers.Authorization = `Bearer ${newToken}`;
    return apiClient.request(original);
  },
);
