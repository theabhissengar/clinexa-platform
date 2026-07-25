import { z } from "zod";

/**
 * Public (browser-exposed) environment variables.
 *
 * Only `NEXT_PUBLIC_*` values belong here — they are inlined into the client bundle.
 *
 * Future server-only secrets (session keys, etc.) must live in a separate module
 * (e.g. `server-env.ts`) with **no** `NEXT_PUBLIC_` prefix, and must never be
 * imported from Client Components.
 */

const publicEnvSchema = z.object({
  NEXT_PUBLIC_API_BASE_URL: z.string().url("NEXT_PUBLIC_API_BASE_URL must be a valid URL"),
  NEXT_PUBLIC_APP_NAME: z.string().min(1, "NEXT_PUBLIC_APP_NAME is required"),
});

function loadPublicEnv() {
  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  });

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `Invalid public environment configuration. Fix the following:\n${details}`,
    );
  }

  return {
    apiBaseUrl: parsed.data.NEXT_PUBLIC_API_BASE_URL.replace(/\/$/, ""),
    appName: parsed.data.NEXT_PUBLIC_APP_NAME,
  } as const;
}

export const publicEnv = loadPublicEnv();

export const isDevelopment = process.env.NODE_ENV === "development";
export const isProduction = process.env.NODE_ENV === "production";
