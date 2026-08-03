"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Legacy Media stub → Asset Library.
 */
export default function GuardianMediaRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/guardian/assets");
  }, [router]);
  return (
    <main className="px-6 py-10 text-sm text-muted-foreground">
      Redirecting to Asset Library…
    </main>
  );
}
