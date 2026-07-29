"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Canonical category editor URL is `/guardian/categories/:id/edit`.
 * Keep `/guardian/categories/:id` as a stable redirect for bookmarks and CRM deep links.
 */
export default function GuardianCategoryIdRedirectPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/guardian/categories/${params.id}/edit`);
  }, [params.id, router]);

  return (
    <main className="px-6 py-10 text-sm text-muted-foreground">
      Opening category…
    </main>
  );
}
