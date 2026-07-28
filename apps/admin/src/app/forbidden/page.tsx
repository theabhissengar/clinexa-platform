"use client";

import Link from "next/link";

import { usePermissions } from "@/features/auth/hooks/use-permissions";
import { useAuth } from "@/providers/auth-provider";
import { resolveDefaultLanding } from "@/lib/platform-context";

export default function ForbiddenPage() {
  const { status } = useAuth();
  const { can, roles } = usePermissions();

  const homeHref =
    status === "authenticated"
      ? (resolveDefaultLanding({ can, roles }) ?? "/login")
      : "/login";

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="mx-auto max-w-md text-center">
        <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
          Access denied
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Forbidden
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          You are signed in but do not have permission to view this resource.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            href={homeHref}
            className="inline-flex h-8 items-center justify-center rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
          >
            {status === "authenticated" ? "Go home" : "Sign in"}
          </Link>
        </div>
      </div>
    </main>
  );
}
