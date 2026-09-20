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
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-3 sm:gap-3 sm:px-4 lg:px-6">
      <SidebarTrigger className="-ml-0.5" />
      <Separator orientation="vertical" className="mr-0.5 hidden h-4 sm:block" />
      <div className="min-w-0 flex-1">
        <AppBreadcrumbs />
      </div>
      <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
        <ApplicationSwitcher />
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
