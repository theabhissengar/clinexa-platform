"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Unauthenticated entry — redirects to login.
 */
export default function UnauthorizedPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/login");
  }, [router]);

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <p className="text-sm text-muted-foreground">Redirecting to sign in…</p>
    </main>
  );
}
