"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback } from "react";

import { AppBreadcrumbs } from "@/components/layout/app-breadcrumbs";
import { ApplicationSwitcher } from "@/components/layout/application-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { ModuleDetailSearch } from "@/components/patterns/module-detail-search";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { listCrmUsers } from "@/features/users/api/users-api";
import { resolveContextFromPathname } from "@/lib/platform-context";
import { cn } from "@/lib/utils";

const CRM_USER_DETAIL_RE = /^\/crm\/users\/([^/]+)$/;

/**
 * Permanent application header — owns chrome slots only.
 * Light mode: soft paper chrome (cooler than the page canvas).
 */
export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const context = resolveContextFromPathname(pathname);
  const isGuardian = context === "guardian";
  const crmUserMatch = pathname.match(CRM_USER_DETAIL_RE);
  const showCrmUserSearch = Boolean(crmUserMatch?.[1]);

  const searchUsers = useCallback(async (q: string) => {
    const result = await listCrmUsers({ q, take: 10 });
    return result.items.map((row) => ({
      id: row.id,
      label:
        row.displayName ||
        [row.firstName, row.lastName].filter(Boolean).join(" ") ||
        row.email,
      sublabel: row.email,
    }));
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b px-3 sm:gap-3 sm:px-4 lg:px-6",
        "border-black/6 bg-[linear-gradient(90deg,#ece9e3_0%,#e5e1d9_52%,#ddd7cc_100%)]",
        "dark:border-white/15 dark:bg-[linear-gradient(90deg,#1a1814_0%,#1c1e22_48%,#2a2418_100%)]",
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
      <div className="min-w-0 shrink">
        <AppBreadcrumbs />
      </div>
      {showCrmUserSearch ? (
        <div className="mx-1 min-w-0 flex-1 sm:mx-2 lg:mx-4">
          <ModuleDetailSearch
            placeholder="Search users…"
            searchFn={searchUsers}
            onSelect={(id) =>
              router.push(`/crm/users/${id}?section=profile`)
            }
            className="w-full max-w-md md:mx-auto"
            inputClassName="h-9 rounded-full border-black/10 bg-white/80 dark:border-white/20 dark:bg-white/8"
          />
        </div>
      ) : (
        <div className="min-w-0 flex-1" />
      )}
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
