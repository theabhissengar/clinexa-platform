"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePermissions } from "@/features/auth/hooks/use-permissions";
import { Permissions } from "@/features/auth/permissions";
import {
  activateAdminSubscription,
  addAdminSubscriptionNote,
  archiveAdminSubscription,
  cancelAdminSubscription,
  correctAdminSubscription,
  deleteAdminSubscription,
  getAdminSubscription,
  listAdminSubscriptionActivity,
  listAdminSubscriptionNotes,
  listAdminSubscriptionRenewals,
  openAdminManualRenewal,
  overrideAdminSubscription,
  pauseAdminSubscription,
  restoreAdminSubscription,
  resumeAdminSubscription,
  retryAdminRenewalAttempt,
} from "@/features/subscriptions/api/admin-subscriptions-api";
import {
  customerLabel,
  formatDateTime,
  formatMoneyCents,
  getErrorMessage,
  intervalLabel,
  statusLabel,
} from "@/features/subscriptions/lib/format";
import type {
  SubscriptionActivity,
  SubscriptionDetail,
  SubscriptionNote,
  SubscriptionRenewalAttempt,
  SubscriptionStatus,
} from "@/features/subscriptions/types";

const ALL_STATUSES: SubscriptionStatus[] = [
  "PENDING_SETUP",
  "ACTIVE",
  "PAUSED",
  "PAST_DUE",
  "CANCELLED",
  "EXPIRED",
  "COMPLETED",
];

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

function formatJson(value: unknown): string {
  if (value == null) return "—";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function promptReason(label: string): string | null {
  const reason = window.prompt(label);
  if (reason == null) return null;
  return reason.trim();
}

export function GuardianSubscriptionDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const subscriptionId = params.id;
  const { can } = usePermissions();

  const returnQs = searchParams.get("return");
  const backHref =
    returnQs && returnQs.startsWith("?")
      ? `/guardian/subscriptions${returnQs}`
      : "/guardian/subscriptions";

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
  const [overrideTo, setOverrideTo] = useState<SubscriptionStatus | "">("");
  const [overrideReason, setOverrideReason] = useState("");
  const [correctFirstName, setCorrectFirstName] = useState("");
  const [correctLastName, setCorrectLastName] = useState("");
  const [correctEmail, setCorrectEmail] = useState("");
  const [correctPhone, setCorrectPhone] = useState("");
  const [correctReason, setCorrectReason] = useState("");

  const canEdit = can(Permissions.SUB_EDIT);
  const canLifecycle = can(Permissions.SUB_LIFECYCLE);
  const canRenew = can(Permissions.SUB_RENEW);
  const canDelete = can(Permissions.SUB_DELETE);
  const canArchive = can(Permissions.SUB_ARCHIVE);
  const canRestore = can(Permissions.SUB_RESTORE);
  const canCorrect = can(Permissions.SUB_CORRECT);
  const canOverride = can(Permissions.SUB_OVERRIDE);

  const load = useCallback(
    async (opts?: { quiet?: boolean }) => {
      if (!opts?.quiet) setLoading(true);
      setError(null);
      try {
        const [detail, noteRows, activityRows, renewalRows] = await Promise.all(
          [
            getAdminSubscription(subscriptionId, true),
            listAdminSubscriptionNotes(subscriptionId),
            listAdminSubscriptionActivity(subscriptionId),
            listAdminSubscriptionRenewals(subscriptionId),
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
      setError(null);
      try {
        const [detail, noteRows, activityRows, renewalRows] = await Promise.all(
          [
            getAdminSubscription(subscriptionId, true),
            listAdminSubscriptionNotes(subscriptionId),
            listAdminSubscriptionActivity(subscriptionId),
            listAdminSubscriptionRenewals(subscriptionId),
          ],
        );
        if (cancelled) return;
        setRow(detail);
        setNotes(noteRows);
        setActivity(activityRows);
        setRenewals(renewalRows);
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
            {row.archivedAt ? " · archived" : ""}
            {row.deletedAt ? " · deleted" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/guardian/subscriptions/${row.id}/history`}
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            History
          </Link>
          <Link
            href={`/guardian/subscriptions/${row.id}/activity`}
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Activity
          </Link>
          <Link
            href={`/guardian/subscriptions/${row.id}/notes`}
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Notes
          </Link>
          {canEdit && !row.deletedAt ? (
            <Button
              size="sm"
              variant="outline"
              render={<Link href={`/guardian/subscriptions/${row.id}/edit`} />}
            >
              Edit
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
          <Field label="Ends at" value={formatDateTime(row.endsAt)} />
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
                href={`/guardian/users/${row.patient.id}`}
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

      <Section title="Plan / product snapshot">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Name" value={row.plan?.name ?? "—"} />
          <Field
            label="Interval"
            value={intervalLabel(
              row.plan?.billingInterval,
              row.plan?.intervalCount,
            )}
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
        {row.items.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No items.</p>
        ) : (
          <table className="mt-3 w-full text-left text-sm">
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

      <Section title="Payment references">
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          <Field label="Method ID" value={row.paymentMethodId ?? "—"} />
          <Field
            label="Provider customer"
            value={row.providerCustomerRef ?? "—"}
          />
          <Field
            label="Provider subscription"
            value={row.providerSubscriptionRef ?? "—"}
          />
          <Field label="Latest payment" value={row.latestPaymentId ?? "—"} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Opaque references only. Payments owns execution.
        </p>
      </Section>

      <Section title="Orders">
        <div className="flex flex-col gap-2 text-sm">
          <div>
            Initial:{" "}
            {row.initialOrder ? (
              <Link
                href={`/guardian/orders/${row.initialOrder.id}`}
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
                href={`/guardian/orders/${row.latestOrder.id}`}
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

      <Section title="Operational / admin fields">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Ops flags" value={<pre className="whitespace-pre-wrap text-xs">{formatJson(row.opsFlags)}</pre>} />
          <Field label="Admin tags" value={<pre className="whitespace-pre-wrap text-xs">{formatJson(row.adminTags)}</pre>} />
          <Field
            label="Reconciliation flags"
            value={<pre className="whitespace-pre-wrap text-xs">{formatJson(row.reconciliationFlags)}</pre>}
          />
        </div>
      </Section>

      <Section title="Renewal attempts">
        <p className="mb-3 text-sm text-muted-foreground">
          Attempt status only. Renewal orders are not created in this phase.
        </p>
        {renewals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No renewal attempts.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {renewals.map((attempt) => (
              <li key={attempt.id} className="border-b border-border pb-2">
                {attempt.billingPeriodKey} · {statusLabel(attempt.status)} ·
                retries {attempt.retryCount}
                {canRenew ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-2"
                    disabled={busy}
                    onClick={() =>
                      void runAction("Retry submitted.", () =>
                        retryAdminRenewalAttempt(row.id, attempt.id),
                      )
                    }
                  >
                    Retry
                  </Button>
                ) : null}
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
            {canLifecycle && row.status === "PENDING_SETUP" ? (
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  void runAction("Subscription activated.", () =>
                    activateAdminSubscription(row.id, reason || undefined),
                  )
                }
              >
                Activate
              </Button>
            ) : null}
            {canLifecycle && row.canPause ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void runAction("Subscription paused.", () =>
                    pauseAdminSubscription(row.id, reason || undefined),
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
                    resumeAdminSubscription(row.id, reason || undefined),
                  )
                }
              >
                Resume
              </Button>
            ) : null}
            {canLifecycle && row.canCancel ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void runAction(
                    "Subscription cancelled.",
                    () => cancelAdminSubscription(row.id, reason || undefined),
                    "Cancel this subscription? Future renewals will stop.",
                  )
                }
              >
                Cancel
              </Button>
            ) : null}
            {canRenew ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void runAction(
                    "Manual renewal started (order + payment).",
                    () => openAdminManualRenewal(row.id),
                    "Start a manual renewal for the current period? This creates a renewal order and attempts payment via Payments.",
                  )
                }
              >
                Manual renewal
              </Button>
            ) : null}
          </div>
        </Section>
      )}

      {(canArchive || canDelete || canRestore) && (
        <Section title="Class D operations">
          <div className="flex flex-wrap gap-2">
            {canArchive && !row.archivedAt && !row.deletedAt ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  const archiveReason = promptReason("Archive reason");
                  if (!archiveReason) return;
                  void runAction(
                    "Subscription archived.",
                    () => archiveAdminSubscription(row.id, archiveReason),
                    "Archive this subscription?",
                  );
                }}
              >
                Archive
              </Button>
            ) : null}
            {canDelete && !row.deletedAt ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  const deleteReason = promptReason("Soft-delete reason");
                  if (!deleteReason) return;
                  void runAction(
                    "Subscription soft-deleted.",
                    () => deleteAdminSubscription(row.id, deleteReason),
                    "Soft-delete this subscription?",
                  );
                }}
              >
                Soft-delete
              </Button>
            ) : null}
            {canRestore && (row.archivedAt || row.deletedAt) ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  const restoreReason = promptReason("Restore reason");
                  if (!restoreReason) return;
                  void runAction("Subscription restored.", () =>
                    restoreAdminSubscription(row.id, restoreReason),
                  );
                }}
              >
                Restore
              </Button>
            ) : null}
          </div>
        </Section>
      )}

      {canCorrect ? (
        <Section title="Customer snapshot correction">
          <p className="mb-3 text-xs text-muted-foreground">
            Corrects the bound customer snapshot. Does not rewrite historical
            product snapshots or execute Payments.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="correctFirstName">First name</Label>
              <Input
                id="correctFirstName"
                value={correctFirstName}
                onChange={(event) => setCorrectFirstName(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="correctLastName">Last name</Label>
              <Input
                id="correctLastName"
                value={correctLastName}
                onChange={(event) => setCorrectLastName(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="correctEmail">Email</Label>
              <Input
                id="correctEmail"
                value={correctEmail}
                onChange={(event) => setCorrectEmail(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="correctPhone">Phone</Label>
              <Input
                id="correctPhone"
                value={correctPhone}
                onChange={(event) => setCorrectPhone(event.target.value)}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="correctReason">Reason</Label>
              <Input
                id="correctReason"
                value={correctReason}
                onChange={(event) => setCorrectReason(event.target.value)}
              />
            </div>
          </div>
          <Button
            className="mt-3"
            size="sm"
            disabled={busy || correctReason.trim().length < 3}
            onClick={() =>
              void runAction("Customer snapshot corrected.", () =>
                correctAdminSubscription(row.id, {
                  reason: correctReason.trim(),
                  firstName: correctFirstName || null,
                  lastName: correctLastName || null,
                  email: correctEmail || null,
                  phone: correctPhone || null,
                }),
              )
            }
          >
            Apply correction
          </Button>
        </Section>
      ) : null}

      {canOverride ? (
        <Section title="Administrative override">
          <p className="mb-3 text-xs text-muted-foreground">
            Super Admin only. Does not silently bypass clinical or payment
            gates.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={overrideTo}
              onChange={(event) =>
                setOverrideTo(event.target.value as SubscriptionStatus | "")
              }
            >
              <option value="">Target status</option>
              {ALL_STATUSES.filter((status) => status !== row.status).map(
                (status) => (
                  <option key={status} value={status}>
                    {statusLabel(status)}
                  </option>
                ),
              )}
            </select>
            <Input
              className="w-64"
              placeholder="Override reason"
              value={overrideReason}
              onChange={(event) => setOverrideReason(event.target.value)}
            />
            <Button
              size="sm"
              disabled={busy || !overrideTo || overrideReason.trim().length < 3}
              onClick={() =>
                void runAction(
                  "Override applied.",
                  () =>
                    overrideAdminSubscription(row.id, {
                      toStatus: overrideTo as SubscriptionStatus,
                      reason: overrideReason.trim(),
                    }),
                  "Force this status override?",
                )
              }
            >
              Override
            </Button>
          </div>
        </Section>
      ) : null}

      <Section title="Notes" id="notes">
        {canEdit ? (
          <form
            className="mb-3 space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!noteBody.trim()) return;
              void runAction("Note added.", async () => {
                await addAdminSubscriptionNote(row.id, noteBody.trim());
                setNoteBody("");
              });
            }}
          >
            <textarea
              className="min-h-20 w-full rounded-md border border-input bg-background p-2 text-sm"
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
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(note.createdAt)}
                </span>
                <div>{note.body}</div>
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
            {activity.slice(0, 8).map((entry) => (
              <li key={entry.id}>
                {formatDateTime(entry.createdAt)} · {entry.summary}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </main>
  );
}
