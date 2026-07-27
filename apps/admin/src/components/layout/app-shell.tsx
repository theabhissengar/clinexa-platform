"use client";

import type { ReactNode } from "react";

import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

type AppShellProps = {
  children: ReactNode;
};

/**
 * Application shell composition only — no RBAC, nav, or business logic.
 */
export function AppShell({ children }: AppShellProps) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="overflow-hidden">
        <AppHeader />
        <div className="flex flex-1 flex-col overflow-auto">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
