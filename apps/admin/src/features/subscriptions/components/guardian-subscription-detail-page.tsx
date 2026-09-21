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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { usePermissions } from "@/features/auth/hooks/use-permissions";
import { Permissions } from "@/features/auth/permissions";
import {
  activateAdminSubscription,
  addAdminSubscriptionNote,
  archiveAdminSubscription,
  cancelAdminSubscription,
  correctAdminSubscription,
  createPendingAdminRenewal,
  deleteAdminSubscription,
  getAdminSubscription,
  listAdminSubscriptionActivity,
  listAdminSubscriptionNotes,
  listAdminSubscriptionRenewals,
  listAdminSubscriptions,
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
  productStatusLabel,
} from "@/features/subscriptions/lib/format";
import { NotesTimeline } from "@/features/shared/components/notes-timeline";
import { ModuleDetailSearch } from "@/features/shared/components/module-detail-search";
import { RelatedEntityTree } from "@/features/shared/components/related-entity-tree";
import { AdminTagsList } from "@/features/shared/components/admin-tags-editor";
import { RenewalActionsDropdown } from "@/features/shared/components/renewal-actions-dropdown";
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

type PendingConfirm = {
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  successMessage: string;
  work: () => Promise<unknown>;
};

type PendingReason = {
  title: string;
  description?: string;
  inputLabel: string;
  confirmLabel: string;
  onSubmit: (reason: string) => void;
};

export function GuardianSubscriptionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
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
  const [reason, setReason] = useState("");
  const [overrideTo, setOverrideTo] = useState<SubscriptionStatus | "">("");
  const [overrideReason, setOverrideReason] = useState("");
  const [correctFirstName, setCorrectFirstName] = useState("");
  const [correctLastName, setCorrectLastName] = useState("");
  const [correctEmail, setCorrectEmail] = useState("");
  const [correctPhone, setCorrectPhone] = useState("");
  const [correctReason, setCorrectReason] = useState("");
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(
    null,
  );
  const [pendingReason, setPendingReason] = useState<PendingReason | null>(
    null,
  );
  const [reasonDraft, setReasonDraft] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);

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

  function openReasonDialog(config: PendingReason) {
    setReasonDraft("");
    setReasonError(null);
    setPendingReason(config);
  }

  function submitReasonDialog() {
    if (!pendingReason) return;
    const trimmed = reasonDraft.trim();
    if (!trimmed) {
      setReasonError("Reason is required.");
      return;
    }
    const { onSubmit } = pendingReason;
    setPendingReason(null);
    setReasonDraft("");
    setReasonError(null);
    onSubmit(trimmed);
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

  const identifierParts = [
    `Cycle ${row.cycleNumber}`,
    `created ${formatDateTime(row.createdAt)}`,
  ];
  if (row.archivedAt) identifierParts.push("archived");
  if (row.deletedAt) identifierParts.push("deleted");

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
        identifier={identifierParts.join(" · ")}
        status={<StatusBadge status={row.status} />}
        actions={
          <PageHeaderActions>
            <Button
              size="sm"
              variant="outline"
              render={
                <Link href={`/guardian/subscriptions/${row.id}/history`} />
              }
            >
              History
            </Button>
            <Button
              size="sm"
              variant="outline"
              render={
                <Link href={`/guardian/subscriptions/${row.id}/activity`} />
              }
            >
              Activity
            </Button>
            <Button
              size="sm"
              variant="outline"
              render={<Link href={`/guardian/subscriptions/${row.id}/notes`} />}
            >
              Notes
            </Button>
            {canEdit && !row.deletedAt ? (
              <Button
                size="sm"
                variant="outline"
                render={
                  <Link href={`/guardian/subscriptions/${row.id}/edit`} />
                }
              >
                Edit
              </Button>
            ) : null}
          </PageHeaderActions>
        }
      />

      <ModuleDetailSearch
        placeholder="Subscription number, customer, id…"
        searchFn={async (q) => {
          const result = await listAdminSubscriptions({ q, take: 8 });
          return result.items.map((item) => ({
            id: item.id,
            label: item.subscriptionNumber ?? item.id,
            sublabel: customerLabel(item),
          }));
        }}
        onSelect={(id) => router.push(`/guardian/subscriptions/${id}`)}
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
            <Field label="Ends at" value={formatDateTime(row.endsAt)} />
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
                  href={`/guardian/users/${row.patient.id}`}
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

        <DetailSection title="Plan / product snapshot">
          <FieldGrid columns={3}>
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
          </FieldGrid>
          {row.items.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No items.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
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

        <DetailSection title="Payment references">
          <FieldGrid columns={3}>
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
          </FieldGrid>
          <p className="mt-2 text-xs text-muted-foreground">
            Opaque references only. Payments owns execution.
          </p>
        </DetailSection>

        <DetailSection title="Orders">
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
        </DetailSection>

        <DetailSection title="Operational / admin fields">
          <FieldGrid columns={2}>
            <Field
              label="Ops flags"
              value={
                <pre className="whitespace-pre-wrap text-xs">
                  {formatJson(row.opsFlags)}
                </pre>
              }
            />
            <Field
              label="Admin tags"
              value={<AdminTagsList value={row.adminTags} />}
            />
            <Field
              label="Reconciliation flags"
              value={
                <pre className="whitespace-pre-wrap text-xs">
                  {formatJson(row.reconciliationFlags)}
                </pre>
              }
            />
          </FieldGrid>
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
                          href={`/guardian/orders/${attempt.orderId}`}
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

        <DetailSection title="Renewal attempts">
          <p className="mb-3 text-sm text-muted-foreground">
            Renewal attempt history for this subscription.
          </p>
          {renewals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No renewal attempts.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {renewals.map((attempt) => (
                <li
                  key={attempt.id}
                  className="flex flex-wrap items-center gap-2 border-b border-border pb-2"
                >
                  <span>{attempt.billingPeriodKey}</span>
                  <StatusBadge status={attempt.status} />
                  <span className="text-muted-foreground">
                    retries {attempt.retryCount}
                  </span>
                  {canRenew ? (
                    <Button
                      size="sm"
                      variant="ghost"
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
                    runAction(
                      "Subscription cancelled.",
                      () =>
                        cancelAdminSubscription(row.id, reason || undefined),
                      {
                        title: "Cancel this subscription?",
                        description: "Future renewals will stop.",
                        confirmLabel: "Cancel subscription",
                        destructive: true,
                      },
                    )
                  }
                >
                  Cancel
                </Button>
              ) : null}
              {canRenew ? (
                <RenewalActionsDropdown
                  disabled={busy}
                  canCreatePending={row.status === "ACTIVE"}
                  onCreatePending={() =>
                    runAction(
                      "Pending renewal order created.",
                      () =>
                        createPendingAdminRenewal(
                          row.id,
                          reason || undefined,
                        ),
                      {
                        title: "Create a pending renewal order?",
                        description:
                          "Create a pending renewal order for the current period? Subscription will move to On Hold.",
                        confirmLabel: "Create pending renewal",
                      },
                    )
                  }
                  onProcessRenewal={() =>
                    runAction(
                      "Manual renewal started (order + payment).",
                      () => openAdminManualRenewal(row.id),
                      {
                        title: "Start a manual renewal?",
                        description:
                          "Start a manual renewal for the current period? This creates a renewal order and attempts payment via Payments.",
                        confirmLabel: "Process renewal",
                      },
                    )
                  }
                />
              ) : null}
            </div>
          </DetailSection>
        )}

        {(canArchive || canDelete || canRestore) && (
          <DetailSection title="Class D operations">
            <div className="flex flex-wrap gap-2">
              {canArchive && !row.archivedAt && !row.deletedAt ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    openReasonDialog({
                      title: "Archive reason",
                      inputLabel: "Archive reason",
                      confirmLabel: "Continue",
                      onSubmit: (archiveReason) => {
                        runAction(
                          "Subscription archived.",
                          () =>
                            archiveAdminSubscription(row.id, archiveReason),
                          {
                            title: "Archive this subscription?",
                            description:
                              "The subscription will be archived and hidden from the default list.",
                            confirmLabel: "Archive",
                          },
                        );
                      },
                    })
                  }
                >
                  Archive
                </Button>
              ) : null}
              {canDelete && !row.deletedAt ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    openReasonDialog({
                      title: "Soft-delete reason",
                      inputLabel: "Soft-delete reason",
                      confirmLabel: "Continue",
                      onSubmit: (deleteReason) => {
                        runAction(
                          "Subscription soft-deleted.",
                          () =>
                            deleteAdminSubscription(row.id, deleteReason),
                          {
                            title: "Soft-delete this subscription?",
                            description:
                              "The subscription will be soft-deleted and excluded from active records.",
                            confirmLabel: "Soft-delete",
                            destructive: true,
                          },
                        );
                      },
                    })
                  }
                >
                  Soft-delete
                </Button>
              ) : null}
              {canRestore && (row.archivedAt || row.deletedAt) ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    openReasonDialog({
                      title: "Restore reason",
                      inputLabel: "Restore reason",
                      confirmLabel: "Restore",
                      onSubmit: (restoreReason) => {
                        void runAction("Subscription restored.", () =>
                          restoreAdminSubscription(row.id, restoreReason),
                        );
                      },
                    })
                  }
                >
                  Restore
                </Button>
              ) : null}
            </div>
          </DetailSection>
        )}

        {canCorrect ? (
          <DetailSection title="Customer snapshot correction">
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
          </DetailSection>
        ) : null}

        {canOverride ? (
          <DetailSection title="Administrative override">
            <p className="mb-3 text-xs text-muted-foreground">
              Super Admin only. Does not silently bypass clinical or payment
              gates.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <select
                className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
                value={overrideTo}
                onChange={(event) =>
                  setOverrideTo(event.target.value as SubscriptionStatus | "")
                }
              >
                <option value="">Target status</option>
                {ALL_STATUSES.filter((status) => status !== row.status).map(
                  (status) => (
                    <option key={status} value={status}>
                      {productStatusLabel(status)}
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
                disabled={
                  busy || !overrideTo || overrideReason.trim().length < 3
                }
                onClick={() =>
                  runAction(
                    "Override applied.",
                    () =>
                      overrideAdminSubscription(row.id, {
                        toStatus: overrideTo as SubscriptionStatus,
                        reason: overrideReason.trim(),
                      }),
                    {
                      title: "Force this status override?",
                      description:
                        "Administrative override will change the subscription status without bypassing clinical or payment gates.",
                      confirmLabel: "Override",
                      destructive: true,
                    },
                  )
                }
              >
                Override
              </Button>
            </div>
          </DetailSection>
        ) : null}

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
                      addAdminSubscriptionNote(row.id, body, visibility),
                    ).catch(() => {});
                  }
                : undefined
            }
          />
        </DetailSection>

        <DetailSection title="Related entities">
          <RelatedEntityTree
            context="guardian"
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

      <Dialog
        open={pendingReason != null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingReason(null);
            setReasonDraft("");
            setReasonError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pendingReason?.title ?? ""}</DialogTitle>
            {pendingReason?.description ? (
              <DialogDescription>{pendingReason.description}</DialogDescription>
            ) : null}
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="subscription-reason-input">
              {pendingReason?.inputLabel ?? "Reason"}
            </Label>
            <Input
              id="subscription-reason-input"
              value={reasonDraft}
              onChange={(event) => {
                setReasonDraft(event.target.value);
                if (reasonError) setReasonError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitReasonDialog();
                }
              }}
              autoFocus
            />
            {reasonError ? (
              <p className="text-sm text-destructive" role="alert">
                {reasonError}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPendingReason(null);
                setReasonDraft("");
                setReasonError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!reasonDraft.trim()}
              onClick={submitReasonDialog}
            >
              {pendingReason?.confirmLabel ?? "Continue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ClinexaPage>
  );
}
