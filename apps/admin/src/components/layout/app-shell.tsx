"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { NAV_ITEMS } from "@/components/layout/nav-config";
import { usePermissions } from "@/features/auth/hooks/use-permissions";
import { useAuth } from "@/providers/auth-provider";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const { user, logout } = useAuth();
  const { can } = usePermissions();
  const pathname = usePathname();

  const visibleNav = NAV_ITEMS.filter(
    (item) => !item.permission || can(item.permission),
  );

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-8">
            <Link href="/" className="text-sm font-semibold tracking-tight">
              Clinexa
            </Link>
            <nav className="flex items-center gap-4">
              {visibleNav.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={
                      active
                        ? "text-sm font-medium text-foreground"
                        : "text-sm text-muted-foreground hover:text-foreground"
                    }
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {user?.email}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void logout();
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
