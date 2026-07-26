"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { Permissions } from "@/features/auth/permissions";
import { usePermissions } from "@/features/auth/hooks/use-permissions";
import { useAuth } from "@/providers/auth-provider";

export default function ProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { status } = useAuth();
  const { can } = usePermissions();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }
    if (status === "authenticated" && !can(Permissions.CRM_ACCESS_SHELL)) {
      router.replace("/forbidden");
    }
  }, [status, can, router]);

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

  if (!can(Permissions.CRM_ACCESS_SHELL)) {
    return null;
  }

  return <AppShell>{children}</AppShell>;
}
