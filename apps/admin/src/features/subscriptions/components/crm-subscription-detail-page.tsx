"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { usePermissions } from "@/features/auth/hooks/use-permissions";
import { Permissions } from "@/features/auth/permissions";
import {
  addCrmSubscriptionNote,
  cancelCrmSubscription,
  getCrmSubscription,
  listCrmSubscriptionActivity,
  listCrmSubscriptionNotes,
  listCrmSubscriptionRenewals,
  openCrmManualRenewal,
  pauseCrmSubscription,
  resumeCrmSubscription,
  retryCrmRenewalAttempt,
} from "@/features/subscriptions/api/subscriptions-api";
import {
  customerLabel,
  formatDateTime,
  formatMoneyCents,
  getErrorMessage,
  statusLabel,
} from "@/features/subscriptions/lib/format";
import type {
  SubscriptionActivity,
  SubscriptionDetail,
  SubscriptionNote,
  SubscriptionRenewalAttempt,
} from "@/features/subscriptions/types";

function Section({
  title,
  children,
  id,
}: {
  title: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section
      id={id}
      className="rounded-md border border-border bg-background p-4"
    >
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

export function CrmSubscriptionDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const subscriptionId = params.id;
  const { can } = usePermissions();

  const returnQs = searchParams.get("return");
  const backHref =
    returnQs && returnQs.startsWith("?")
      ? `/crm/subscriptions${returnQs}`
      : "/crm/subscriptions";

  const [row, setRow] = useState<SubscriptionDetail | null>(null);
  const [notes, setNotes] = useState<SubscriptionNote[]>([]);
  const [activity, setActivity] = useState<SubscriptionActivity[]>([]);
  const [renewals, setRenewals] = useState<SubscriptionRenewalAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [reason, setReason] = useState("");

  const canEdit = can(Permissions.SUB_EDIT);
  const canLifecycle = can(Permissions.SUB_LIFECYCLE);
  const canRenew = can(Permissions.SUB_RENEW);

  const load = useCallback(
    async (opts?: { quiet?: boolean }) => {
      if (!opts?.quiet) setLoading(true);
      setError(null);
      try {
        const [detail, noteRows, activityRows, renewalRows] = await Promise.all(
          [
            getCrmSubscription(subscriptionId),
            listCrmSubscriptionNotes(subscriptionId),
            listCrmSubscriptionActivity(subscriptionId),
            listCrmSubscriptionRenewals(subscriptionId),
          ],
        );
        setRow(detail);
        setNotes(noteRows);
        setActivity(activityRows);
        setRenewals(renewalRows);
      } catch (err) {
        setRow(null);
        setError(getErrorMessage(err, "Unable to load subscription."));
      } finally {
        setLoading(false);
      }
    },
    [subscriptionId],
  );

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      try {
        const [detail, noteRows, activityRows, renewalRows] = await Promise.all(
          [
            getCrmSubscription(subscriptionId),
            listCrmSubscriptionNotes(subscriptionId),
            listCrmSubscriptionActivity(subscriptionId),
            listCrmSubscriptionRenewals(subscriptionId),
          ],
        );
        if (cancelled) return;
        setRow(detail);
        setNotes(noteRows);
        setActivity(activityRows);
        setRenewals(renewalRows);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setRow(null);
        setError(getErrorMessage(err, "Unable to load subscription."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [subscriptionId]);

  async function runAction(
    label: string,
    work: () => Promise<unknown>,
    confirmText?: string,
  ) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await work();
      setMessage(label);
      setReason("");
      await load({ quiet: true });
    } catch (err) {
      setError(getErrorMessage(err, "Unable to complete action."));
    } finally {
      setBusy(false);
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
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-3 px-4 py-8 md:px-6">
        <Link
          href={backHref}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← All subscriptions
        </Link>
        <p className="text-sm text-destructive">
          {error ?? "Subscription not found."}
        </p>
      </main>
    );
  }

  const currentAttempt = renewals[0];

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={backHref}
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            ← All subscriptions
          </Link>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">
            {row.subscriptionNumber ?? row.id}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {statusLabel(row.status)} · cycle {row.cycleNumber} · created{" "}
            {formatDateTime(row.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/crm/subscriptions/${row.id}/history`}
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            History
          </Link>
          <Link
            href={`/crm/subscriptions/${row.id}/activity`}
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Activity
          </Link>
          <Link
            href={`/crm/subscriptions/${row.id}/notes`}
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Notes
          </Link>
          {canEdit ? (
            <Button
              size="sm"
              variant="outline"
              render={<Link href={`/crm/subscriptions/${row.id}/edit`} />}
            >
              Edit ops fields
            </Button>
          ) : null}
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

      <Section title="Overview">
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          <Field label="Status" value={statusLabel(row.status)} />
          <Field label="Plan" value={row.plan?.name ?? "—"} />
          <Field label="Cycle" value={row.cycleNumber} />
          <Field
            label="Current period"
            value={`${formatDateTime(row.currentPeriodStart)} → ${formatDateTime(row.currentPeriodEnd)}`}
          />
          <Field label="Next renewal" value={formatDateTime(row.nextRenewalAt)} />
          <Field
            label="Payment snapshot"
            value={row.paymentStatusSummary ?? "—"}
          />
          <Field
            label="Clinical requirement"
            value={statusLabel(row.clinicalRequirement)}
          />
          <Field
            label="Shipping notes"
            value={row.shippingPreferenceNotes ?? "—"}
          />
        </div>
      </Section>

      <Section title="Customer">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Snapshot"
            value={
              <>
                {customerLabel(row)}
                <div className="text-xs text-muted-foreground">
                  {row.customerEmail ?? "—"}
                  {row.customerPhone ? ` · ${row.customerPhone}` : ""}
                </div>
              </>
            }
          />
          <Field
            label="User"
            value={
              <Link
                href={`/crm/users/${row.patient.id}`}
                className="text-primary underline-offset-4 hover:underline"
              >
                {row.patient.displayName ||
                  `${row.patient.firstName ?? ""} ${row.patient.lastName ?? ""}`.trim() ||
                  row.patient.email}
              </Link>
            }
          />
        </div>
      </Section>

      <Section title="Plan">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Name" value={row.plan?.name ?? "—"} />
          <Field
            label="Interval"
            value={
              row.plan?.billingInterval
                ? `${row.plan.intervalCount ?? 1} ${statusLabel(row.plan.billingInterval)}`
                : "—"
            }
          />
          <Field
            label="Plan price"
            value={
              typeof row.plan?.priceCents === "number"
                ? formatMoneyCents(row.plan.priceCents, row.plan.currency)
                : "—"
            }
          />
        </div>
      </Section>

      <Section title="Items">
        {row.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No items.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">Product</th>
                <th className="py-1 font-medium">SKU</th>
                <th className="py-1 font-medium">Qty</th>
                <th className="py-1 font-medium">Price</th>
                <th className="py-1 font-medium">Rx</th>
              </tr>
            </thead>
            <tbody>
              {row.items.map((item) => (
                <tr key={item.id} className="border-t border-border">
                  <td className="py-2">{item.productName}</td>
                  <td className="py-2">{item.sku}</td>
                  <td className="py-2">{item.quantity}</td>
                  <td className="py-2">
                    {formatMoneyCents(item.salePriceCents, item.currency)}
                  </td>
                  <td className="py-2">{item.isRxEligible ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Orders">
        <div className="flex flex-col gap-2 text-sm">
          <div>
            Initial:{" "}
            {row.initialOrder ? (
              <Link
                href={`/crm/orders/${row.initialOrder.id}`}
                className="text-primary underline-offset-4 hover:underline"
              >
                {row.initialOrder.orderNumber}
              </Link>
            ) : (
              "—"
            )}
          </div>
          <div>
            Latest:{" "}
            {row.latestOrder ? (
              <Link
                href={`/crm/orders/${row.latestOrder.id}`}
                className="text-primary underline-offset-4 hover:underline"
              >
                {row.latestOrder.orderNumber}
              </Link>
            ) : (
              "—"
            )}
          </div>
        </div>
      </Section>

      <Section title="Renewal">
        <p className="mb-3 text-sm text-muted-foreground">
          Opaque attempt status only. Payments are not executed from CRM.
        </p>
        {renewals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No renewal attempts.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {renewals.slice(0, 5).map((attempt) => (
              <li key={attempt.id} className="border-b border-border pb-2">
                {attempt.billingPeriodKey} · {statusLabel(attempt.status)} ·
                retries {attempt.retryCount}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {(canLifecycle || canRenew) && (
        <Section title="Lifecycle actions">
          <div className="mb-3">
            <label className="text-xs text-muted-foreground">Reason</label>
            <input
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {canLifecycle && row.canPause ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void runAction("Subscription paused.", () =>
                    pauseCrmSubscription(row.id, reason || undefined),
                  )
                }
              >
                Pause
              </Button>
            ) : null}
            {canLifecycle && row.canResume ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void runAction("Subscription resumed.", () =>
                    resumeCrmSubscription(row.id, reason || undefined),
                  )
                }
              >
                Resume
              </Button>
            ) : null}
            {canLifecycle && row.canCancel ? (
              <Button
                size="sm"
                variant="destructive"
                disabled={busy}
                onClick={() =>
                  void runAction(
                    "Subscription cancelled.",
                    () => cancelCrmSubscription(row.id, reason || undefined),
                    `Cancel ${row.subscriptionNumber ?? "this subscription"}? Future renewals will stop.`,
                  )
                }
              >
                Cancel
              </Button>
            ) : null}
            {canRenew &&
            (row.status === "ACTIVE" ||
              row.status === "PAUSED" ||
              row.status === "PAST_DUE") ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void runAction(
                    "Manual renewal started (order + payment).",
                    () => openCrmManualRenewal(row.id),
                    "Open a manual renewal for the current period? This creates a renewal order and attempts payment authorization via the Payments service.",
                  )
                }
              >
                Manual renewal
              </Button>
            ) : null}
            {canRenew && currentAttempt ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void runAction("Renewal retry requested.", () =>
                    retryCrmRenewalAttempt(row.id, currentAttempt.id),
                  )
                }
              >
                Retry attempt
              </Button>
            ) : null}
          </div>
        </Section>
      )}

      <Section title="Recent notes">
        {canEdit ? (
          <form
            className="mb-3 flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!noteBody.trim()) return;
              void runAction("Note added.", async () => {
                await addCrmSubscriptionNote(row.id, noteBody.trim());
                setNoteBody("");
              });
            }}
          >
            <textarea
              className="min-h-20 rounded-md border border-input bg-background p-2 text-sm"
              value={noteBody}
              onChange={(event) => setNoteBody(event.target.value)}
              placeholder="Internal note"
            />
            <Button type="submit" size="sm" disabled={busy || !noteBody.trim()}>
              Add note
            </Button>
          </form>
        ) : null}
        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notes.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {notes.slice(0, 5).map((note) => (
              <li key={note.id}>
                <div className="text-xs text-muted-foreground">
                  {formatDateTime(note.createdAt)}
                </div>
                {note.body}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Recent activity">
        {activity.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {activity.slice(0, 8).map((event) => (
              <li key={event.id}>
                <span className="text-muted-foreground">
                  {formatDateTime(event.createdAt)}
                </span>{" "}
                {event.summary}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </main>
  );
}
