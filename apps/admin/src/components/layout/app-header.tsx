"use client";

import { AppBreadcrumbs } from "@/components/layout/app-breadcrumbs";
import { ApplicationSwitcher } from "@/components/layout/application-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

/**
 * Permanent application header — owns chrome slots only.
 * Shared by CRM and Guardian (UI-011).
 */
export function AppHeader() {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 h-4" />
      <div className="min-w-0 flex-1">
        <AppBreadcrumbs />
      </div>
      <div className="flex items-center gap-1.5">
        <ApplicationSwitcher />
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
