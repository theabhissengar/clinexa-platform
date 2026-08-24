"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { listCrmSubscriptionHistory } from "@/features/subscriptions/api/subscriptions-api";
import {
  formatDateTime,
  getErrorMessage,
  statusLabel,
} from "@/features/subscriptions/lib/format";
import type { SubscriptionHistoryResponse } from "@/features/subscriptions/types";

export function CrmSubscriptionHistoryPage() {
  const params = useParams<{ id: string }>();
  const [history, setHistory] = useState<SubscriptionHistoryResponse | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void listCrmSubscriptionHistory(params.id)
      .then(setHistory)
      .catch((err) =>
        setError(getErrorMessage(err, "Unable to load history.")),
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
      <h1 className="text-2xl font-semibold tracking-tight">History</h1>
      <p className="text-sm text-muted-foreground">
        Lifecycle transitions and field changes. This is not the platform audit
        log.
      </p>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading history…</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <>
          <section className="rounded-md border border-border p-4">
            <h2 className="text-sm font-semibold">Status history</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {(history?.status ?? []).map((row) => (
                <li key={row.id}>
                  {formatDateTime(row.createdAt)} ·{" "}
                  {row.fromStatus ? statusLabel(row.fromStatus) : "—"} →{" "}
                  {statusLabel(row.toStatus)} ({row.source}
                  {row.reason ? ` · ${row.reason}` : ""})
                </li>
              ))}
              {(history?.status ?? []).length === 0 ? (
                <li className="text-muted-foreground">No status history.</li>
              ) : null}
            </ul>
          </section>
          <section className="rounded-md border border-border p-4">
            <h2 className="text-sm font-semibold">Change history</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {(history?.changes ?? []).map((row) => (
                <li key={row.id}>
                  {formatDateTime(row.createdAt)} · {row.action}
                </li>
              ))}
              {(history?.changes ?? []).length === 0 ? (
                <li className="text-muted-foreground">No field changes.</li>
              ) : null}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
