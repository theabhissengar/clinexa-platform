"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { Permissions } from "@/features/auth/permissions";
import { usePermissions } from "@/features/auth/hooks/use-permissions";
import { useAuth } from "@/providers/auth-provider";

/**
 * Shared protected shell for both Internal Platform contexts.
 * Requires CRM and/or Guardian shell access. Context-specific routes
 * enforce their own prefix permission in nested layouts.
 */
export default function ProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { status } = useAuth();
  const { can } = usePermissions();
  const router = useRouter();

  const hasCrm = can(Permissions.CRM_ACCESS_SHELL);
  const hasGuardian = can(Permissions.GRD_ACCESS_SHELL);
  const hasAnyShell = hasCrm || hasGuardian;

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }
    if (status === "authenticated" && !hasAnyShell) {
      router.replace("/forbidden");
    }
  }, [status, hasAnyShell, router]);

  if (status === "loading") {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <p className="text-sm text-muted-foreground">Restoring session…</p>
      </main>
    );
  }

  if (status !== "authenticated") {
    return null;
  }

  if (!hasAnyShell) {
    return null;
  }

  return <AppShell>{children}</AppShell>;
}
