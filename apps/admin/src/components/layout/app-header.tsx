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
    <header className="relative z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-[color-mix(in_oklch,var(--background)_84%,transparent)] px-3 shadow-sm backdrop-blur-xl sm:gap-3 sm:px-4 lg:px-6">
      <SidebarTrigger className="-ml-0.5 border border-border bg-card/60 shadow-none hover:bg-card" />
      <Separator orientation="vertical" className="mr-0.5 hidden h-4 sm:block" />
      <div className="min-w-0 flex-1">
        <AppBreadcrumbs />
      </div>
      <div className="flex shrink-0 items-center gap-1 rounded-xl bg-card/45 p-0.5 ring-1 ring-foreground/10 sm:gap-1.5">
        <ApplicationSwitcher />
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
