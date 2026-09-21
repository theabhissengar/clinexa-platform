"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { BrandMark } from "@/components/layout/brand-mark";

/**
 * Unauthenticated entry — redirects to login.
 */
export default function UnauthorizedPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/login");
  }, [router]);

  return (
    <main className="flex min-h-dvh flex-1 flex-col items-center justify-center px-4 py-16 sm:px-6">
      <div className="flex flex-col items-center gap-3">
        <BrandMark />
        <p className="text-sm text-muted-foreground">Redirecting to sign in…</p>
      </div>
    </main>
  );
}
