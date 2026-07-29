"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Canonical product editor URL is `/guardian/products/:id/edit`.
 * Keep `/guardian/products/:id` as a stable redirect for bookmarks and CRM deep links.
 */
export default function GuardianProductIdRedirectPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/guardian/products/${params.id}/edit`);
  }, [params.id, router]);

  return (
    <main className="px-6 py-10 text-sm text-muted-foreground">
      Opening product…
    </main>
  );
}
