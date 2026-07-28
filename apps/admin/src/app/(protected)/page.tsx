"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { usePermissions } from "@/features/auth/hooks/use-permissions";
import { useAuth } from "@/providers/auth-provider";
import { resolveDefaultLanding } from "@/lib/platform-context";

/**
 * `/` resolves to the principal's default context landing (NAV-013, NAV-107).
 */
export default function RootRedirectPage() {
  const { status } = useAuth();
  const { can, roles } = usePermissions();
  const router = useRouter();

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }
    const landing = resolveDefaultLanding({ can, roles });
    router.replace(landing ?? "/forbidden");
  }, [status, can, roles, router]);

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <p className="text-sm text-muted-foreground">Opening your workspace…</p>
    </main>
  );
}
