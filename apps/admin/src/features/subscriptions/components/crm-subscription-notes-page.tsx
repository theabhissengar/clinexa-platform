"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { usePermissions } from "@/features/auth/hooks/use-permissions";
import { Permissions } from "@/features/auth/permissions";
import {
  addCrmSubscriptionNote,
  listCrmSubscriptionNotes,
} from "@/features/subscriptions/api/subscriptions-api";
import {
  formatDateTime,
  getErrorMessage,
} from "@/features/subscriptions/lib/format";
import type { SubscriptionNote } from "@/features/subscriptions/types";

export function CrmSubscriptionNotesPage() {
  const params = useParams<{ id: string }>();
  const { can } = usePermissions();
  const canEdit = can(Permissions.SUB_EDIT);
  const [rows, setRows] = useState<SubscriptionNote[]>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    const notes = await listCrmSubscriptionNotes(params.id);
    setRows(notes);
  }

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const notes = await listCrmSubscriptionNotes(params.id);
        if (cancelled) return;
        setRows(notes);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(getErrorMessage(err, "Unable to load notes."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!body.trim() || !canEdit) return;
    setBusy(true);
    setError(null);
    try {
      await addCrmSubscriptionNote(params.id, body.trim());
      setBody("");
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Unable to add note."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-8 md:px-6">
      <Link
        href={`/crm/subscriptions/${params.id}`}
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Subscription
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Notes</h1>
      {canEdit ? (
        <form className="space-y-2" onSubmit={onSubmit}>
          <textarea
            className="min-h-24 w-full rounded-md border border-input bg-background p-2 text-sm"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Internal note"
          />
          <Button type="submit" size="sm" disabled={busy || !body.trim()}>
            Add note
          </Button>
        </form>
      ) : null}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading notes…</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notes.</p>
      ) : (
        <ul className="space-y-3 text-sm">
          {rows.map((row) => (
            <li key={row.id} className="rounded-md border border-border p-3">
              <div className="text-xs text-muted-foreground">
                {formatDateTime(row.createdAt)}
              </div>
              <div className="mt-1 whitespace-pre-wrap">{row.body}</div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
