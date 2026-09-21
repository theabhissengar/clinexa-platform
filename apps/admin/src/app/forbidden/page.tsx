"use client";

import Link from "next/link";

import { BrandMark } from "@/components/layout/brand-mark";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/features/auth/hooks/use-permissions";
import { resolveDefaultLanding } from "@/lib/platform-context";
import { useAuth } from "@/providers/auth-provider";

export default function ForbiddenPage() {
  const { status } = useAuth();
  const { can, roles } = usePermissions();

  const homeHref =
    status === "authenticated"
      ? (resolveDefaultLanding({ can, roles }) ?? "/login")
      : "/login";

  return (
    <main className="flex min-h-dvh flex-1 flex-col items-center justify-center px-4 py-16 sm:px-6">
      <div className="mx-auto flex max-w-md flex-col items-center text-center">
        <BrandMark />
        <p className="mt-6 text-sm font-medium tracking-wide text-muted-foreground uppercase">
          Access denied
        </p>
        <h1 className="mt-3 font-heading text-h1 font-semibold tracking-tight">
          Forbidden
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          You are signed in but do not have permission to view this resource.
        </p>
        <Button
          className="mt-8"
          nativeButton={false}
          render={<Link href={homeHref} />}
        >
          {status === "authenticated" ? "Go home" : "Sign in"}
        </Button>
      </div>
    </main>
  );
}
