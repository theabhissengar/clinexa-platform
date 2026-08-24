"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { listCrmSubscriptionActivity } from "@/features/subscriptions/api/subscriptions-api";
import {
  formatDateTime,
  getErrorMessage,
} from "@/features/subscriptions/lib/format";
import type { SubscriptionActivity } from "@/features/subscriptions/types";

export function CrmSubscriptionActivityPage() {
  const params = useParams<{ id: string }>();
  const [rows, setRows] = useState<SubscriptionActivity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void listCrmSubscriptionActivity(params.id)
      .then(setRows)
      .catch((err) =>
        setError(getErrorMessage(err, "Unable to load activity.")),
      )
      .finally(() => setLoading(false));
  }, [params.id]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 py-8 md:px-6">
      <Link
        href={`/crm/subscriptions/${params.id}`}
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Subscription
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
      <p className="text-sm text-muted-foreground">
        Operational events. Note bodies and platform audit are not stored here.
      </p>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading activity…</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No activity.</p>
      ) : (
        <ul className="space-y-3 text-sm">
          {rows.map((row) => (
            <li key={row.id} className="border-b border-border pb-2">
              <div className="text-xs text-muted-foreground">
                {formatDateTime(row.createdAt)} · {row.kind}
              </div>
              {row.summary}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
