import axios from "axios";

import { publicEnv } from "@/config/env";

/**
 * Shared Axios instance for Backend API calls.
 * Auth interceptors will be added with the Authentication feature.
 */
export const apiClient = axios.create({
  baseURL: publicEnv.apiBaseUrl,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30_000,
});
