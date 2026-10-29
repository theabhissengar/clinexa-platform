"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Legacy history URL — open the editor on the History tab.
 */
export default function GuardianUserHistoryPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/guardian/users/${params.id}/edit?tab=history`);
  }, [params.id, router]);

  return (
    <main className="px-6 py-10 text-sm text-muted-foreground">
      Opening history…
    </main>
  );
}
