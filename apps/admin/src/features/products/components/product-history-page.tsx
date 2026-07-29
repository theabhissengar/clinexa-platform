"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { getProductHistory } from "@/features/products/api/products-api";

export function ProductHistoryPage() {
  const params = useParams<{ id: string }>();
  const [rows, setRows] = useState<
    Array<{ id: string; action: string; createdAt: string }>
  >([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getProductHistory(params.id)
      .then(setRows)
      .catch(() => setError("Unable to load history."));
  }, [params.id]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <Link
          href={`/guardian/products/${params.id}`}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Back to product
        </Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">History</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Entity field and lifecycle change history for this product. Not the
          platform Audit Log.
        </p>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <ul className="space-y-2 text-sm">
        {rows.map((row) => (
          <li key={row.id} className="rounded-md border border-border px-3 py-2">
            <div className="font-medium">{row.action}</div>
            <div className="text-muted-foreground">
              {new Date(row.createdAt).toLocaleString()}
            </div>
          </li>
        ))}
        {!error && rows.length === 0 ? (
          <li className="text-muted-foreground">No history yet.</li>
        ) : null}
      </ul>
    </main>
  );
}
