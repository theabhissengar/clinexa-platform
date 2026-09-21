"use client";

import { usePathname } from "next/navigation";

import { AppBreadcrumbs } from "@/components/layout/app-breadcrumbs";
import { ApplicationSwitcher } from "@/components/layout/application-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { resolveContextFromPathname } from "@/lib/platform-context";
import { cn } from "@/lib/utils";

/**
 * Permanent application header — owns chrome slots only.
 * Soft cream / gold chrome shared by CRM and Guardian.
 */
export function AppHeader() {
  const pathname = usePathname();
  const context = resolveContextFromPathname(pathname);
  const isGuardian = context === "guardian";

  return (
    <header
      className={cn(
        "relative z-10 flex h-14 shrink-0 items-center gap-2 border-b px-3 sm:gap-3 sm:px-4 lg:px-6",
        "border-black/5 bg-[linear-gradient(90deg,#f4efe6_0%,#f7f4ef_48%,#f1e4c4_100%)]",
        "dark:border-white/10 dark:bg-[linear-gradient(90deg,#1a1814_0%,#1c1e22_48%,#2a2418_100%)]",
      )}
    >
      <SidebarTrigger
        className={cn(
          "-ml-0.5 rounded-full border shadow-none",
          "border-black/8 bg-white/70 hover:bg-white dark:border-white/12 dark:bg-white/8 dark:hover:bg-white/12",
        )}
      />
      <Separator
        orientation="vertical"
        className="mr-0.5 hidden h-4 bg-black/10 sm:block dark:bg-white/15"
      />
      <div className="min-w-0 flex-1">
        <AppBreadcrumbs />
      </div>
      <div
        className={cn(
          "flex shrink-0 items-center gap-1 rounded-full p-1 sm:gap-1.5",
          "bg-white/75 shadow-[0_1px_2px_rgba(28,28,28,0.04)] ring-1 ring-black/6",
          "dark:bg-white/8 dark:shadow-none dark:ring-white/10",
          isGuardian && "dark:ring-[#efd56a]/18",
        )}
      >
        <ApplicationSwitcher />
        <ThemeToggle className="rounded-full text-[#6b675f] hover:bg-black/5 hover:text-[#1c1c1c] dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white" />
        <UserMenu />
      </div>
    </header>
  );
}
