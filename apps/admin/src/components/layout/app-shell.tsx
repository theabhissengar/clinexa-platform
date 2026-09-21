"use client";

import type { ReactNode } from "react";

import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { LoginAtmosphere } from "@/features/auth/components/login-atmosphere";
import { AppSwitchLoaderProvider } from "@/providers/app-switch-loader-provider";

type AppShellProps = {
  children: ReactNode;
};

/**
 * Application shell composition only — no RBAC, nav, or business logic.
 * Soft cream canvas behind pages (dashboards may overlay their own surface).
 */
export function AppShell({ children }: AppShellProps) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0 overflow-hidden bg-transparent">
        <AppHeader />
        <AppSwitchLoaderProvider>
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-auto [scrollbar-gutter:stable] bg-[linear-gradient(145deg,#f7f4ef_0%,#f3efe8_42%,#f0e2c4_100%)] dark:bg-[linear-gradient(145deg,#16181c_0%,#1b1e24_45%,#242018_100%)]">
            <LoginAtmosphere variant="form" />
            <div className="relative z-10 flex min-w-0 flex-1 flex-col">
              {children}
            </div>
          </div>
        </AppSwitchLoaderProvider>
      </SidebarInset>
    </SidebarProvider>
  );
}
