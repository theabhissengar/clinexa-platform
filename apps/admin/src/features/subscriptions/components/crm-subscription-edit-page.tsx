"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PaymentMethodSelect } from "@/features/payments/components/payment-method-select";
import {
  getCrmSubscription,
  updateCrmSubscription,
} from "@/features/subscriptions/api/subscriptions-api";
import {
  formatDateTime,
  getErrorMessage,
  statusLabel,
} from "@/features/subscriptions/lib/format";
import type { SubscriptionDetail } from "@/features/subscriptions/types";
import { AdminTagsEditor } from "@/features/shared/components/admin-tags-editor";

function toLocalInput(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}

function fromLocalInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return new Date(trimmed).toISOString();
}

export function CrmSubscriptionEditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const subscriptionId = params.id;

  const [row, setRow] = useState<SubscriptionDetail | null>(null);
  const [shippingNotes, setShippingNotes] = useState("");
  const [opsFlagsText, setOpsFlagsText] = useState("");
  const [adminTags, setAdminTags] = useState<
    Record<string, unknown> | string[] | null
  >(null);
  const [nextRenewalAt, setNextRenewalAt] = useState("");
  const [currentPeriodStart, setCurrentPeriodStart] = useState("");
  const [currentPeriodEnd, setCurrentPeriodEnd] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getCrmSubscription(subscriptionId)
      .then((detail) => {
        setRow(detail);
        setShippingNotes(detail.shippingPreferenceNotes ?? "");
        setOpsFlagsText(
          detail.opsFlags ? JSON.stringify(detail.opsFlags, null, 2) : "",
        );
        setAdminTags(
          (detail.adminTags as Record<string, unknown> | string[] | null) ??
            null,
        );
        setNextRenewalAt(toLocalInput(detail.nextRenewalAt));
        setCurrentPeriodStart(toLocalInput(detail.currentPeriodStart));
        setCurrentPeriodEnd(toLocalInput(detail.currentPeriodEnd));
        setEndsAt(toLocalInput(detail.endsAt));
        setPaymentMethodId(detail.paymentMethodId ?? "");
      })
      .catch((err) =>
        setError(getErrorMessage(err, "Unable to load subscription.")),
      )
      .finally(() => setLoading(false));
  }, [subscriptionId]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!row) return;
    let opsFlags: Record<string, unknown> | null = null;
    if (opsFlagsText.trim()) {
      try {
        const parsed: unknown = JSON.parse(opsFlagsText);
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
          setError("Ops flags must be a JSON object.");
          return;
        }
        opsFlags = parsed as Record<string, unknown>;
      } catch {
        setError("Ops flags must be valid JSON.");
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      await updateCrmSubscription(row.id, {
        shippingPreferenceNotes: shippingNotes || null,
        opsFlags,
        adminTags,
        nextRenewalAt: fromLocalInput(nextRenewalAt),
        currentPeriodStart: fromLocalInput(currentPeriodStart),
        currentPeriodEnd: fromLocalInput(currentPeriodEnd),
        endsAt: fromLocalInput(endsAt),
        paymentMethodId: paymentMethodId || null,
      });
      router.push(`/crm/subscriptions/${row.id}`);
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
          href="/crm/subscriptions"
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
          href={`/crm/subscriptions/${row.id}`}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← {row.subscriptionNumber ?? row.id}
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Edit operational fields
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Status {statusLabel(row.status)} · updated {formatDateTime(row.updatedAt)}.
          Timeline edits update the subscription schedule source of truth.
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
            placeholder='{"holdShipment": true}'
          />
        </div>
        <AdminTagsEditor
          key={row.id}
          value={adminTags}
          onChange={setAdminTags}
        />

        <div className="rounded-md border border-border p-3">
          <div className="mb-3 text-sm font-medium">Payment timeline</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="currentPeriodStart">Current period start</Label>
              <Input
                id="currentPeriodStart"
                type="datetime-local"
                value={currentPeriodStart}
                onChange={(e) => setCurrentPeriodStart(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="currentPeriodEnd">Current period end</Label>
              <Input
                id="currentPeriodEnd"
                type="datetime-local"
                value={currentPeriodEnd}
                onChange={(e) => setCurrentPeriodEnd(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="nextRenewalAt">Next renewal</Label>
              <Input
                id="nextRenewalAt"
                type="datetime-local"
                value={nextRenewalAt}
                onChange={(e) => setNextRenewalAt(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="endsAt">Ends at</Label>
              <Input
                id="endsAt"
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-3">
            <PaymentMethodSelect
              userId={row.patientUserId}
              value={paymentMethodId}
              onChange={setPaymentMethodId}
              context="crm"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            variant="outline"
            render={<Link href={`/crm/subscriptions/${row.id}`} />}
          >
            Cancel
          </Button>
        </div>
      </form>
    </main>
  );
}
