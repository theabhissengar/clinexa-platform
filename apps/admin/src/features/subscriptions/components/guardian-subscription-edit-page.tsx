"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  getAdminSubscription,
  updateAdminSubscription,
} from "@/features/subscriptions/api/admin-subscriptions-api";
import {
  formatDateTime,
  getErrorMessage,
  parseJsonObject,
  statusLabel,
} from "@/features/subscriptions/lib/format";
import type { SubscriptionDetail } from "@/features/subscriptions/types";

export function GuardianSubscriptionEditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const subscriptionId = params.id;

  const [row, setRow] = useState<SubscriptionDetail | null>(null);
  const [shippingNotes, setShippingNotes] = useState("");
  const [opsFlagsText, setOpsFlagsText] = useState("");
  const [adminTagsText, setAdminTagsText] = useState("");
  const [reconciliationText, setReconciliationText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getAdminSubscription(subscriptionId, true)
      .then((detail) => {
        setRow(detail);
        setShippingNotes(detail.shippingPreferenceNotes ?? "");
        setOpsFlagsText(
          detail.opsFlags ? JSON.stringify(detail.opsFlags, null, 2) : "",
        );
        setAdminTagsText(
          detail.adminTags ? JSON.stringify(detail.adminTags, null, 2) : "",
        );
        setReconciliationText(
          detail.reconciliationFlags
            ? JSON.stringify(detail.reconciliationFlags, null, 2)
            : "",
        );
      })
      .catch((err) =>
        setError(getErrorMessage(err, "Unable to load subscription.")),
      )
      .finally(() => setLoading(false));
  }, [subscriptionId]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!row) return;
    const opsFlags = parseJsonObject(opsFlagsText, "Ops flags");
    const adminTags = parseJsonObject(adminTagsText, "Admin tags");
    const reconciliationFlags = parseJsonObject(
      reconciliationText,
      "Reconciliation flags",
    );
    if (!opsFlags.ok) {
      setError(opsFlags.error);
      return;
    }
    if (!adminTags.ok) {
      setError(adminTags.error);
      return;
    }
    if (!reconciliationFlags.ok) {
      setError(reconciliationFlags.error);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateAdminSubscription(row.id, {
        shippingPreferenceNotes: shippingNotes || null,
        opsFlags: opsFlags.value,
        adminTags: adminTags.value,
        reconciliationFlags: reconciliationFlags.value,
      });
      router.push(`/guardian/subscriptions/${row.id}`);
    } catch (err) {
      setError(getErrorMessage(err, "Unable to save subscription."));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="px-6 py-10 text-sm text-muted-foreground">
        Loading subscription…
      </main>
    );
  }

  if (!row) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-sm text-destructive">
          {error ?? "Subscription not found."}
        </p>
        <Link
          href="/guardian/subscriptions"
          className="mt-3 inline-block text-sm underline"
        >
          Back to subscriptions
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-8 md:px-6">
      <div>
        <Link
          href={`/guardian/subscriptions/${row.id}`}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← {row.subscriptionNumber ?? row.id}
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Edit administrative fields
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Status {statusLabel(row.status)} · updated {formatDateTime(row.updatedAt)}.
          Product/customer snapshots, clinical requirement, and payment
          execution are not editable here.
        </p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-1">
          <Label htmlFor="shippingNotes">Shipping preference notes</Label>
          <textarea
            id="shippingNotes"
            className="min-h-24 w-full rounded-md border border-input bg-background p-2 text-sm"
            value={shippingNotes}
            onChange={(event) => setShippingNotes(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="opsFlags">Ops flags (JSON object)</Label>
          <textarea
            id="opsFlags"
            className="min-h-24 w-full rounded-md border border-input bg-background p-2 font-mono text-sm"
            value={opsFlagsText}
            onChange={(event) => setOpsFlagsText(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="adminTags">Admin tags (JSON object)</Label>
          <textarea
            id="adminTags"
            className="min-h-24 w-full rounded-md border border-input bg-background p-2 font-mono text-sm"
            value={adminTagsText}
            onChange={(event) => setAdminTagsText(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="reconciliationFlags">
            Reconciliation flags (JSON object)
          </Label>
          <textarea
            id="reconciliationFlags"
            className="min-h-24 w-full rounded-md border border-input bg-background p-2 font-mono text-sm"
            value={reconciliationText}
            onChange={(event) => setReconciliationText(event.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            variant="outline"
            render={<Link href={`/guardian/subscriptions/${row.id}`} />}
          >
            Cancel
          </Button>
        </div>
      </form>
    </main>
  );
}
