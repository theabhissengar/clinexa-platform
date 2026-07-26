"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState, type ReactNode } from "react";

import { AuthProvider } from "@/providers/auth-provider";
import { PermissionProvider } from "@/providers/permission-provider";

type AppProvidersProps = {
  children: ReactNode;
};

/**
 * Root client providers for the Internal Management application.
 */
export function AppProviders({ children }: AppProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <PermissionProvider>{children}</PermissionProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
