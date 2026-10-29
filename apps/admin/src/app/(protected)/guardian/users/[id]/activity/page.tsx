"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Legacy activity URL — open the editor on the Activity tab.
 */
export default function GuardianUserActivityPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/guardian/users/${params.id}/edit?tab=activity`);
  }, [params.id, router]);

  return (
    <main className="px-6 py-10 text-sm text-muted-foreground">
      Opening activity…
    </main>
  );
}
