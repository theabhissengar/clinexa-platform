"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  ClinexaPage,
  ConfirmDialog,
  DetailSection,
  EntityDetailHeader,
  EntityDetailLeading,
  ErrorState,
  FieldGrid,
  PageBody,
  PageHeaderActions,
  PageSkeleton,
} from "@/components/patterns";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { usePermissions } from "@/features/auth/hooks/use-permissions";
import { Permissions } from "@/features/auth/permissions";
import {
  addCrmSubscriptionNote,
  cancelCrmSubscription,
  createPendingCrmRenewal,
  getCrmSubscription,
  listCrmSubscriptionActivity,
  listCrmSubscriptionNotes,
  listCrmSubscriptionRenewals,
  listCrmSubscriptions,
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
import { NotesTimeline } from "@/features/shared/components/notes-timeline";
import { ModuleDetailSearch } from "@/features/shared/components/module-detail-search";
import { RelatedEntityTree } from "@/features/shared/components/related-entity-tree";
import type {
  SubscriptionActivity,
  SubscriptionDetail,
  SubscriptionNote,
  SubscriptionRenewalAttempt,
} from "@/features/subscriptions/types";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

type PendingConfirm = {
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  successMessage: string;
  work: () => Promise<unknown>;
};

export function CrmSubscriptionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
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
  const [renewalMode, setRenewalMode] = useState<"pending" | "process">(
    "process",
  );
  const [reason, setReason] = useState("");
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(
    null,
  );

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

  async function executeAction(
    label: string,
    work: () => Promise<unknown>,
  ) {
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
      throw err;
    } finally {
      setBusy(false);
    }
  }

  function runAction(
    label: string,
    work: () => Promise<unknown>,
    confirm?: {
      title: string;
      description: string;
      confirmLabel: string;
      destructive?: boolean;
    },
  ) {
    if (confirm) {
      setPendingConfirm({
        ...confirm,
        successMessage: label,
        work,
      });
      return;
    }
    void executeAction(label, work).catch(() => {});
  }

  if (loading) {
    return (
      <ClinexaPage width="wide">
        <PageSkeleton />
      </ClinexaPage>
    );
  }

  if (!row) {
    return (
      <ClinexaPage width="wide" className="gap-4">
        <EntityDetailLeading>
          <Link
            href={backHref}
            className="underline-offset-4 hover:underline"
          >
            ← All subscriptions
          </Link>
        </EntityDetailLeading>
        <ErrorState title="Unable to load subscription">
          {error ?? "Subscription not found."}
        </ErrorState>
      </ClinexaPage>
    );
  }

  const currentAttempt = renewals[0];

  return (
    <ClinexaPage width="wide" className="gap-6">
      <EntityDetailHeader
        leading={
          <EntityDetailLeading>
            <Link
              href={backHref}
              className="underline-offset-4 hover:underline"
            >
              ← All subscriptions
            </Link>
          </EntityDetailLeading>
        }
        title={row.subscriptionNumber ?? row.id}
        identifier={`Cycle ${row.cycleNumber} · created ${formatDateTime(row.createdAt)}`}
        status={<StatusBadge status={row.status} />}
        actions={
          <PageHeaderActions>
            <Button
              size="sm"
              variant="outline"
              render={
                <a
                  href={`/guardian/subscriptions/${row.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              Open in Guardian
            </Button>
            <Button
              size="sm"
              variant="outline"
              render={<Link href={`/crm/subscriptions/${row.id}/history`} />}
            >
              History
            </Button>
            <Button
              size="sm"
              variant="outline"
              render={<Link href={`/crm/subscriptions/${row.id}/activity`} />}
            >
              Activity
            </Button>
            <Button
              size="sm"
              variant="outline"
              render={<Link href={`/crm/subscriptions/${row.id}/notes`} />}
            >
              Notes
            </Button>
            {canEdit ? (
              <Button
                size="sm"
                variant="outline"
                render={<Link href={`/crm/subscriptions/${row.id}/edit`} />}
              >
                Edit ops fields
              </Button>
            ) : null}
          </PageHeaderActions>
        }
      />

      <ModuleDetailSearch
        placeholder="Subscription number, customer, id…"
        searchFn={async (q) => {
          const result = await listCrmSubscriptions({ q, take: 8 });
          return result.items.map((item) => ({
            id: item.id,
            label: item.subscriptionNumber ?? item.id,
            sublabel: customerLabel(item),
          }));
        }}
        onSelect={(id) => router.push(`/crm/subscriptions/${id}`)}
      />

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="text-sm text-success" role="status">
          {message}
        </p>
      ) : null}

      <PageBody className="gap-4">
        <DetailSection title="Overview">
          <FieldGrid columns={3}>
            <Field label="Status" value={<StatusBadge status={row.status} />} />
            <Field label="Plan" value={row.plan?.name ?? "—"} />
            <Field label="Cycle" value={row.cycleNumber} />
            <Field
              label="Current period"
              value={`${formatDateTime(row.currentPeriodStart)} → ${formatDateTime(row.currentPeriodEnd)}`}
            />
            <Field
              label="Next renewal"
              value={formatDateTime(row.nextRenewalAt)}
            />
            <Field
              label="Payment snapshot"
              value={row.paymentStatusSummary ?? "—"}
            />
            <Field
              label="Clinical requirement"
              value={<StatusBadge status={row.clinicalRequirement} />}
            />
            <Field
              label="Shipping notes"
              value={row.shippingPreferenceNotes ?? "—"}
            />
          </FieldGrid>
        </DetailSection>

        <DetailSection title="Customer">
          <FieldGrid columns={2}>
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
          </FieldGrid>
        </DetailSection>

        <DetailSection title="Plan">
          <FieldGrid columns={3}>
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
          </FieldGrid>
        </DetailSection>

        <DetailSection title="Items">
          {row.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No items.</p>
          ) : (
            <div className="overflow-x-auto">
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
                      <td className="py-2">
                        {item.isRxEligible ? "Yes" : "No"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DetailSection>

        <DetailSection title="Orders">
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
        </DetailSection>

        <DetailSection title="Payment timeline">
          {renewals.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No payment events yet.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {renewals.map((attempt) => (
                <li key={attempt.id} className="border-b border-border pb-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {attempt.billingPeriodKey}
                    </span>
                    <StatusBadge status={attempt.status} />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Payment: {attempt.paymentStatusSummary ?? "—"}
                    {attempt.orderId ? (
                      <>
                        {" "}
                        · Order{" "}
                        <Link
                          href={`/crm/orders/${attempt.orderId}`}
                          className="underline-offset-4 hover:underline"
                        >
                          {attempt.orderId.slice(0, 8)}…
                        </Link>
                      </>
                    ) : null}
                    {" · "}
                    {formatDateTime(attempt.createdAt)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DetailSection>

        <DetailSection title="Renewal">
          <p className="mb-3 text-sm text-muted-foreground">
            Opaque attempt status only. Payments are not executed from CRM.
          </p>
          {renewals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No renewal attempts.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {renewals.slice(0, 5).map((attempt) => (
                <li
                  key={attempt.id}
                  className="flex flex-wrap items-center gap-2 border-b border-border pb-2"
                >
                  <span>{attempt.billingPeriodKey}</span>
                  <StatusBadge status={attempt.status} />
                  <span className="text-muted-foreground">
                    retries {attempt.retryCount}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DetailSection>

        {(canLifecycle || canRenew) && (
          <DetailSection title="Lifecycle actions">
            <div className="mb-3">
              <label className="text-xs text-muted-foreground">Reason</label>
              <input
                className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
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
                    runAction(
                      "Subscription cancelled.",
                      () => cancelCrmSubscription(row.id, reason || undefined),
                      {
                        title: `Cancel ${row.subscriptionNumber ?? "this subscription"}?`,
                        description:
                          "Future renewals will stop.",
                        confirmLabel: "Cancel subscription",
                        destructive: true,
                      },
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
                <>
                  <div className="mb-2 space-y-1">
                    <label className="text-xs text-muted-foreground">
                      Renewal action
                    </label>
                    <select
                      className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
                      value={renewalMode}
                      onChange={(event) =>
                        setRenewalMode(
                          event.target.value as "pending" | "process",
                        )
                      }
                    >
                      <option value="pending">Create pending renewal</option>
                      <option value="process">Process renewal</option>
                    </select>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      runAction(
                        renewalMode === "pending"
                          ? "Pending renewal order created."
                          : "Manual renewal started (order + payment).",
                        () =>
                          renewalMode === "pending"
                            ? createPendingCrmRenewal(
                                row.id,
                                reason || undefined,
                              )
                            : openCrmManualRenewal(row.id),
                        {
                          title:
                            renewalMode === "pending"
                              ? "Create pending renewal?"
                              : "Process renewal?",
                          description:
                            renewalMode === "pending"
                              ? "Create a pending renewal order for the current period? Subscription will move to On Hold."
                              : "Open a manual renewal for the current period? This creates a renewal order and attempts payment authorization via the Payments service.",
                          confirmLabel:
                            renewalMode === "pending"
                              ? "Create pending renewal"
                              : "Process renewal",
                        },
                      )
                    }
                  >
                    {renewalMode === "pending"
                      ? "Create pending renewal"
                      : "Process renewal"}
                  </Button>
                </>
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
          </DetailSection>
        )}

        <DetailSection title="Notes & activity" id="notes">
          <NotesTimeline
            notes={notes}
            activities={activity}
            composerDisabled={!canEdit}
            addingNote={busy}
            onAddNote={
              canEdit
                ? async (body, visibility) => {
                    await executeAction("Note added.", () =>
                      addCrmSubscriptionNote(row.id, body, visibility),
                    ).catch(() => {});
                  }
                : undefined
            }
          />
        </DetailSection>

        <DetailSection title="Related entities">
          <RelatedEntityTree
            context="crm"
            user={{
              id: row.patient.id,
              label: customerLabel(row),
            }}
            parentOrder={
              row.initialOrder
                ? {
                    id: row.initialOrder.id,
                    label: row.initialOrder.orderNumber,
                  }
                : undefined
            }
            subscription={{
              id: row.id,
              label: row.subscriptionNumber ?? row.id,
            }}
            renewals={renewals
              .filter((attempt) => attempt.orderId)
              .map((attempt) => ({
                id: attempt.orderId!,
                label: attempt.billingPeriodKey,
              }))}
          />
        </DetailSection>
      </PageBody>

      <ConfirmDialog
        open={pendingConfirm != null}
        onOpenChange={(open) => {
          if (!open) setPendingConfirm(null);
        }}
        title={pendingConfirm?.title ?? ""}
        description={pendingConfirm?.description}
        confirmLabel={pendingConfirm?.confirmLabel}
        destructive={pendingConfirm?.destructive}
        loading={busy}
        onConfirm={async () => {
          if (!pendingConfirm) return;
          const { successMessage, work } = pendingConfirm;
          await executeAction(successMessage, work);
        }}
      />
    </ClinexaPage>
  );
}
