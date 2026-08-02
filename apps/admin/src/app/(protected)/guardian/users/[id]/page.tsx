"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Canonical user editor URL is `/guardian/users/:id/edit`.
 * Keep `/guardian/users/:id` as a stable redirect for bookmarks and CRM deep links.
 */
export default function GuardianUserIdRedirectPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/guardian/users/${params.id}/edit`);
  }, [params.id, router]);

  return (
    <main className="px-6 py-10 text-sm text-muted-foreground">
      Opening user…
    </main>
  );
}
