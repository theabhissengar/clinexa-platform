"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

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
  addAdminOrderNote,
  archiveAdminOrder,
  correctAdminOrder,
  deleteAdminOrder,
  getAdminOrder,
  listAdminOrderActivity,
  listAdminOrderHistory,
  listAdminOrderNotes,
  listAdminOrders,
  overrideAdminOrder,
  restoreAdminOrder,
  retryAdminOrderPayment,
  transitionAdminOrder,
} from "@/features/orders/api/admin-orders-api";
import { OrderPaymentRetryPanel } from "@/features/orders/components/order-payment-retry-panel";
import {
  customerLabel,
  formatDateTime,
  formatMoneyCents,
  productStatusLabel,
  statusLabel,
} from "@/features/orders/lib/format";
import { ModuleDetailSearch } from "@/features/shared/components/module-detail-search";
import { NotesTimeline } from "@/features/shared/components/notes-timeline";
import { RelatedEntityTree } from "@/features/shared/components/related-entity-tree";
import { AdminTagsList } from "@/features/shared/components/admin-tags-editor";
import type { NoteVisibility } from "@/features/shared/types/notes";
import type {
  OrderActivity,
  OrderDetail,
  OrderNote,
  OrderStatus,
  OrderStatusHistory,
} from "@/features/orders/types";

const ALL_STATUSES: OrderStatus[] = [
  "DRAFT",
  "PAYMENT_PENDING",
  "AWAITING_CLINICAL_REVIEW",
  "CLINICAL_APPROVED",
  "CLINICAL_DECLINED",
  "AWAITING_FULFILLMENT",
  "FULFILLED",
  "CANCELLED",
  "REFUNDED",
];

function getErrorMessage(error: unknown, fallback: string): string {
  if (
    error &&
    typeof error === "object" &&
    "response" in error &&
    error.response &&
    typeof error.response === "object" &&
    "data" in error.response &&
    error.response.data &&
    typeof error.response.data === "object" &&
    "message" in error.response.data
  ) {
    const message = (error.response.data as { message?: unknown }).message;
    if (typeof message === "string") return message;
    if (Array.isArray(message)) return message.join(", ");
  }
  return fallback;
}

function formatJson(value: unknown): string {
  if (value == null) return "—";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

type ReasonPromptDialogProps = {
  open: boolean;
  label: string;
  onSubmit: (reason: string) => void;
  onCancel: () => void;
};

function ReasonPromptDialog({
  open,
  label,
  onSubmit,
  onCancel,
}: ReasonPromptDialogProps) {
  const [reason, setReason] = useState("");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setReason("");
          onCancel();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reason</DialogTitle>
          <DialogDescription>{label}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="admin-order-reason">Reason</Label>
          <Input
            id="admin-order-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            autoFocus
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                const trimmed = reason.trim();
                setReason("");
                onSubmit(trimmed);
              }
            }}
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setReason("");
              onCancel();
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              const trimmed = reason.trim();
              setReason("");
              onSubmit(trimmed);
            }}
          >
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function GuardianOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = params.id;
  const { can } = usePermissions();

  const returnQs = searchParams.get("return");
  const backHref =
    returnQs && returnQs.startsWith("?")
      ? `/guardian/orders${returnQs}`
      : "/guardian/orders";

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [notes, setNotes] = useState<OrderNote[]>([]);
  const [history, setHistory] = useState<OrderStatusHistory[]>([]);
  const [activity, setActivity] = useState<OrderActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [addingNote, setAddingNote] = useState(false);

  const [transitionTo, setTransitionTo] = useState<OrderStatus | "">("");
  const [transitionReason, setTransitionReason] = useState("");
  const [correctAmountCents, setCorrectAmountCents] = useState("");
  const [correctReason, setCorrectReason] = useState("");
  const [overrideTo, setOverrideTo] = useState<OrderStatus | "">("");
  const [overrideReason, setOverrideReason] = useState("");

  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [correctConfirmOpen, setCorrectConfirmOpen] = useState(false);
  const [overrideConfirmOpen, setOverrideConfirmOpen] = useState(false);

  const [reasonPromptOpen, setReasonPromptOpen] = useState(false);
  const [reasonPromptLabel, setReasonPromptLabel] = useState("");
  const reasonResolverRef = useRef<((value: string | null) => void) | null>(
    null,
  );

  const canEdit = can(Permissions.ORD_EDIT);
  const canArchive = can(Permissions.ORD_ARCHIVE);
  const canDelete = can(Permissions.ORD_DELETE);
  const canRestore = can(Permissions.ORD_RESTORE);
  const canCorrect = can(Permissions.ORD_CORRECT);
  const canOverride = can(Permissions.ORD_OVERRIDE);

  const promptReason = useCallback((label: string): Promise<string | null> => {
    setReasonPromptLabel(label);
    setReasonPromptOpen(true);
    return new Promise((resolve) => {
      reasonResolverRef.current = resolve;
    });
  }, []);

  function resolveReasonPrompt(value: string | null) {
    setReasonPromptOpen(false);
    const resolve = reasonResolverRef.current;
    reasonResolverRef.current = null;
    resolve?.(value);
  }

  const load = useCallback(async () => {
    const [detail, noteRows, historyRows, activityRows] = await Promise.all([
      getAdminOrder(orderId, true),
      listAdminOrderNotes(orderId),
      listAdminOrderHistory(orderId),
      listAdminOrderActivity(orderId),
    ]);
    setOrder(detail);
    setNotes(noteRows);
    setHistory(historyRows);
    setActivity(activityRows);
    setTransitionTo("");
    setOverrideTo("");
  }, [orderId]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const [detail, noteRows, historyRows, activityRows] = await Promise.all(
          [
            getAdminOrder(orderId, true),
            listAdminOrderNotes(orderId),
            listAdminOrderHistory(orderId),
            listAdminOrderActivity(orderId),
          ],
        );
        if (cancelled) return;
        setOrder(detail);
        setNotes(noteRows);
        setHistory(historyRows);
        setActivity(activityRows);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setOrder(null);
        setError(getErrorMessage(err, "Unable to load order."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  async function handleAddNote(body: string, visibility: NoteVisibility) {
    if (!order || !canEdit) return;
    setAddingNote(true);
    setMessage(null);
    setError(null);
    try {
      await addAdminOrderNote(order.id, body, visibility);
      setMessage("Note added.");
      const noteRows = await listAdminOrderNotes(orderId);
      setNotes(noteRows);
    } catch (err) {
      setError(getErrorMessage(err, "Unable to add note."));
    } finally {
      setAddingNote(false);
    }
  }

  async function runAction(
    action: () => Promise<unknown>,
    successMessage: string,
    fallbackError: string,
  ) {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await action();
      setMessage(successMessage);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, fallbackError));
    } finally {
      setBusy(false);
    }
  }

  async function onArchiveConfirm() {
    if (!order || !canArchive) return;
    const id = order.id;
    // Return immediately so ConfirmDialog closes, then collect reason.
    queueMicrotask(() => {
      void (async () => {
        const reason = await promptReason("Archive reason (optional):");
        if (reason == null) return;
        await runAction(
          () => archiveAdminOrder(id, reason || undefined),
          "Order archived.",
          "Unable to archive order.",
        );
      })();
    });
  }

  async function onSoftDeleteConfirm() {
    if (!order || !canDelete) return;
    const id = order.id;
    queueMicrotask(() => {
      void (async () => {
        const reason = await promptReason("Soft-delete reason (optional):");
        if (reason == null) return;
        await runAction(
          () => deleteAdminOrder(id, reason || undefined),
          "Order soft-deleted.",
          "Unable to soft-delete order.",
        );
      })();
    });
  }

  async function onRestoreConfirm() {
    if (!order || !canRestore) return;
    const id = order.id;
    queueMicrotask(() => {
      void (async () => {
        const reason = await promptReason("Restore reason (optional):");
        if (reason == null) return;
        await runAction(
          () => restoreAdminOrder(id, reason || undefined),
          "Order restored.",
          "Unable to restore order.",
        );
      })();
    });
  }

  async function onTransition(event: React.FormEvent) {
    event.preventDefault();
    if (!order || !canEdit || !transitionTo) return;
    await runAction(
      () =>
        transitionAdminOrder(order.id, {
          toStatus: transitionTo,
          reason: transitionReason.trim() || undefined,
        }),
      "Status transition applied.",
      "Unable to transition order.",
    );
    setTransitionReason("");
  }

  function requestCorrectConfirm(event: React.FormEvent) {
    event.preventDefault();
    if (!order || !canCorrect) return;
    const amountCents = Number(correctAmountCents);
    if (!Number.isFinite(amountCents) || amountCents === 0) {
      setError("Correction amount (cents) must be a non-zero number.");
      return;
    }
    setCorrectConfirmOpen(true);
  }

  async function onCorrectConfirm() {
    if (!order || !canCorrect) return;
    const amountCents = Number(correctAmountCents);
    if (!Number.isFinite(amountCents) || amountCents === 0) {
      setError("Correction amount (cents) must be a non-zero number.");
      return;
    }
    await runAction(
      () =>
        correctAdminOrder(order.id, {
          amountCents,
          reason: correctReason.trim() || undefined,
        }),
      "Financial correction recorded.",
      "Unable to apply correction.",
    );
    setCorrectAmountCents("");
    setCorrectReason("");
  }

  function requestOverrideConfirm(event: React.FormEvent) {
    event.preventDefault();
    if (!order || !canOverride || !overrideTo) return;
    if (!overrideReason.trim()) {
      setError("Override reason is required.");
      return;
    }
    setOverrideConfirmOpen(true);
  }

  async function onOverrideConfirm() {
    if (!order || !canOverride || !overrideTo) return;
    if (!overrideReason.trim()) {
      setError("Override reason is required.");
      return;
    }
    await runAction(
      () =>
        overrideAdminOrder(order.id, {
          toStatus: overrideTo,
          reason: overrideReason.trim(),
        }),
      "Administrative override applied.",
      "Unable to override order.",
    );
    setOverrideReason("");
  }

  if (loading) {
    return (
      <ClinexaPage width="wide">
        <PageSkeleton />
      </ClinexaPage>
    );
  }

  if (!order) {
    return (
      <ClinexaPage width="wide" className="gap-6">
        <EntityDetailLeading>
          <Link
            href={backHref}
            className="underline-offset-4 hover:underline"
          >
            ← All orders
          </Link>
        </EntityDetailLeading>
        <ErrorState title="Unable to load order">
          {error ?? "Order not found."}
        </ErrorState>
      </ClinexaPage>
    );
  }

  const shipping = order.addresses.find((a) => a.kind === "SHIPPING");
  const billing = order.addresses.find((a) => a.kind === "BILLING");
  const adjustments = order.adjustments ?? [];
  const correctAmountNumber = Number(correctAmountCents);

  return (
    <ClinexaPage width="wide" className="gap-6">
      <EntityDetailHeader
        leading={
          <EntityDetailLeading>
            <Link
              href={backHref}
              className="underline-offset-4 hover:underline"
            >
              ← All orders
            </Link>
          </EntityDetailLeading>
        }
        title={order.orderNumber}
        identifier={`${statusLabel(order.orderType)} · ${formatDateTime(order.createdAt)}`}
        status={<StatusBadge status={order.status} />}
        metadata={
          <>
            {order.archivedAt ? (
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                Archived {formatDateTime(order.archivedAt)}
              </span>
            ) : null}
            {order.deletedAt ? (
              <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">
                Deleted {formatDateTime(order.deletedAt)}
              </span>
            ) : null}
          </>
        }
        actions={
          <PageHeaderActions>
            {canEdit ? (
              <Button
                size="sm"
                variant="outline"
                render={<Link href={`/guardian/orders/${order.id}/edit`} />}
              >
                Edit
              </Button>
            ) : null}
            {canArchive && !order.archivedAt && !order.deletedAt ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => setArchiveConfirmOpen(true)}
              >
                Archive
              </Button>
            ) : null}
            {canDelete && !order.deletedAt ? (
              <Button
                size="sm"
                variant="destructive"
                disabled={busy}
                onClick={() => setDeleteConfirmOpen(true)}
              >
                Soft-delete
              </Button>
            ) : null}
            {canRestore && (order.archivedAt || order.deletedAt) ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => setRestoreConfirmOpen(true)}
              >
                Restore
              </Button>
            ) : null}
          </PageHeaderActions>
        }
      />

      {message ? (
        <p className="text-sm text-success" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <PageBody dense>
        <DetailSection title="Search orders">
          <ModuleDetailSearch
            placeholder="Order number, customer, id…"
            searchFn={async (q) => {
              const result = await listAdminOrders({ q, take: 8 });
              return result.items.map((item) => ({
                id: item.id,
                label: item.orderNumber,
                sublabel: customerLabel(item),
              }));
            }}
            onSelect={(id) => router.push(`/guardian/orders/${id}`)}
          />
        </DetailSection>

        <DetailSection title="Order header">
          <FieldGrid columns={2}>
            <div>
              <div className="text-xs text-muted-foreground">Order ID</div>
              <div className="font-mono text-xs">{order.id}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Total</div>
              <div className="tabular-nums font-medium">
                {formatMoneyCents(order.totalCents, order.currency)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">
                Customer (snapshot)
              </div>
              <div className="text-sm">{customerLabel(order)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Patient user</div>
              <div className="text-sm">
                <Link
                  href={`/crm/users/${order.patientUserId}`}
                  className="text-primary hover:underline"
                >
                  {order.patient.displayName ||
                    order.patient.email ||
                    order.patientUserId}
                </Link>
              </div>
            </div>
          </FieldGrid>
        </DetailSection>

        <DetailSection title="Customer">
          <FieldGrid columns={2}>
            <div>
              <div className="text-xs text-muted-foreground">Snapshot name</div>
              <div className="text-sm">{customerLabel(order)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Snapshot email</div>
              <div className="text-sm">{order.customerEmail ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Snapshot phone</div>
              <div className="text-sm">{order.customerPhone ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">
                Live account phone
              </div>
              <div className="text-sm">{order.patient.phone ?? "—"}</div>
            </div>
          </FieldGrid>
        </DetailSection>

        <DetailSection
          id="items"
          title="Order items"
          description="Historical snapshots — not live catalog data."
        >
          {order.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No line items.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-2 font-medium">Product</th>
                    <th className="py-2 pr-2 font-medium">SKU</th>
                    <th className="py-2 pr-2 font-medium">Qty</th>
                    <th className="py-2 pr-2 font-medium">Unit</th>
                    <th className="py-2 pr-2 font-medium">Discount</th>
                    <th className="py-2 pr-2 font-medium">Line total</th>
                    <th className="py-2 font-medium">Rx</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item) => (
                    <tr key={item.id} className="border-b border-border">
                      <td className="py-2 pr-2">
                        <div>{item.productName}</div>
                        <div className="text-xs text-muted-foreground">
                          {item.productType}
                        </div>
                      </td>
                      <td className="py-2 pr-2 font-mono text-xs">
                        {item.sku}
                      </td>
                      <td className="py-2 pr-2">{item.quantity}</td>
                      <td className="py-2 pr-2 tabular-nums">
                        {formatMoneyCents(item.salePriceCents, order.currency)}
                      </td>
                      <td className="py-2 pr-2 tabular-nums">
                        {formatMoneyCents(item.discountCents, order.currency)}
                      </td>
                      <td className="py-2 pr-2 tabular-nums">
                        {formatMoneyCents(item.lineTotalCents, order.currency)}
                      </td>
                      <td className="py-2">
                        {item.isRxEligible ? "Yes" : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DetailSection>

        <div className="grid gap-4 md:grid-cols-2">
          <DetailSection title="Shipping address (snapshot)">
            {shipping ? (
              <address className="text-sm not-italic leading-relaxed">
                {shipping.fullName ? <div>{shipping.fullName}</div> : null}
                <div>{shipping.line1}</div>
                {shipping.line2 ? <div>{shipping.line2}</div> : null}
                <div>
                  {[shipping.city, shipping.region, shipping.postalCode]
                    .filter(Boolean)
                    .join(", ")}
                </div>
                <div>{shipping.country}</div>
                <div className="mt-1 text-muted-foreground">
                  Phone: {shipping.phone ?? "—"}
                </div>
              </address>
            ) : (
              <p className="text-sm text-muted-foreground">
                No shipping snapshot.
              </p>
            )}
          </DetailSection>
          <DetailSection title="Billing address (snapshot)">
            {billing ? (
              <address className="text-sm not-italic leading-relaxed">
                {billing.fullName ? <div>{billing.fullName}</div> : null}
                <div>{billing.line1}</div>
                {billing.line2 ? <div>{billing.line2}</div> : null}
                <div>
                  {[billing.city, billing.region, billing.postalCode]
                    .filter(Boolean)
                    .join(", ")}
                </div>
                <div>{billing.country}</div>
                <div className="mt-1 text-muted-foreground">
                  Phone: {billing.phone ?? "—"}
                </div>
              </address>
            ) : (
              <p className="text-sm text-muted-foreground">
                No billing snapshot.
              </p>
            )}
          </DetailSection>
        </div>

        <DetailSection
          title="Payment summary"
          description="Payment actions are owned by Payments — not executed here."
        >
          <FieldGrid columns={2}>
            <div>
              <div className="text-xs text-muted-foreground">Status summary</div>
              <div className="text-sm">{order.paymentStatusSummary ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">
                Payment intent ref
              </div>
              <div className="font-mono text-xs">
                {order.paymentIntentId ?? "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">
                Latest payment ref
              </div>
              <div className="font-mono text-xs">
                {order.latestPaymentId ?? "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Refunded</div>
              <div className="tabular-nums text-sm">
                {formatMoneyCents(order.refundedTotalCents, order.currency)}
              </div>
            </div>
          </FieldGrid>
          {order.status === "PAYMENT_PENDING" ? (
            <OrderPaymentRetryPanel
              orderId={order.id}
              patientUserId={order.patientUserId}
              context="admin"
              onRetry={async (paymentMethodId) => {
                await retryAdminOrderPayment(order.id, paymentMethodId);
                const refreshed = await getAdminOrder(order.id, true);
                setOrder(refreshed);
              }}
            />
          ) : null}
        </DetailSection>

        <DetailSection title="Clinical references">
          <FieldGrid columns={2}>
            <div>
              <div className="text-xs text-muted-foreground">Consultation</div>
              <div className="font-mono text-xs">
                {order.consultationId ?? "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Prescription</div>
              <div className="font-mono text-xs">
                {order.prescriptionId ?? "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">
                Questionnaire response
              </div>
              <div className="font-mono text-xs">
                {order.questionnaireResponseId ?? "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">
                Rx / clinical flags
              </div>
              <div className="text-sm">
                {order.isRxOrder ? "Rx order" : "Non-Rx"}
                {order.requiresClinicalReview ? " · requires review" : ""}
              </div>
            </div>
          </FieldGrid>
        </DetailSection>

        <DetailSection
          title="Inventory"
          description="Inventory mutations follow Orders ↔ Inventory ownership rules."
        >
          <p className="text-sm">
            Reservation ref:{" "}
            <span className="font-mono text-xs">
              {order.reservationId ?? "—"}
            </span>
          </p>
        </DetailSection>

        <DetailSection title="Totals">
          <FieldGrid columns={2}>
            <div>
              <div className="text-xs text-muted-foreground">Subtotal</div>
              <div className="tabular-nums text-sm">
                {formatMoneyCents(order.subtotalCents, order.currency)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Discounts</div>
              <div className="tabular-nums text-sm">
                {formatMoneyCents(order.discountTotalCents, order.currency)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Shipping</div>
              <div className="tabular-nums text-sm">
                {formatMoneyCents(order.shippingTotalCents, order.currency)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Tax</div>
              <div className="tabular-nums text-sm">
                {formatMoneyCents(order.taxTotalCents, order.currency)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Adjustments</div>
              <div className="tabular-nums text-sm">
                {formatMoneyCents(order.adjustmentTotalCents, order.currency)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Total</div>
              <div className="tabular-nums text-sm font-medium">
                {formatMoneyCents(order.totalCents, order.currency)}
              </div>
            </div>
          </FieldGrid>
        </DetailSection>

        <DetailSection title="Adjustments">
          {adjustments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No adjustments.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {adjustments.map((row) => (
                <li key={row.id} className="border-b border-border pb-2">
                  <div>
                    <span className="font-medium">{row.kind}</span>{" "}
                    <span className="tabular-nums">
                      {formatMoneyCents(row.amountCents, order.currency)}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {row.actorUserId ?? "system"} ·{" "}
                    {formatDateTime(row.createdAt)}
                    {row.reason ? ` · ${row.reason}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DetailSection>

        <DetailSection title="Admin metadata">
          <FieldGrid columns={2}>
            <div>
              <div className="text-xs text-muted-foreground">
                Tracking / carrier
              </div>
              <div className="text-sm">
                {order.trackingNumber ?? "—"}
                {order.carrier ? ` · ${order.carrier}` : ""}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Shipped at</div>
              <div className="text-sm">{formatDateTime(order.shippedAt)}</div>
            </div>
            <div className="sm:col-span-2">
              <div className="text-xs text-muted-foreground">Admin tags</div>
              <pre className="mt-1 overflow-x-auto rounded-md bg-muted/40 p-2 font-mono text-xs">
                <AdminTagsList value={order.adminTags} />
              </pre>
            </div>
            <div className="sm:col-span-2">
              <div className="text-xs text-muted-foreground">
                Reconciliation flags
              </div>
              <pre className="mt-1 overflow-x-auto rounded-md bg-muted/40 p-2 font-mono text-xs">
                {formatJson(order.reconciliationFlags)}
              </pre>
            </div>
          </FieldGrid>
        </DetailSection>

        {canEdit && order.allowedNextStatuses.length > 0 ? (
          <DetailSection title="Normal status transition">
            <form className="grid gap-3 sm:grid-cols-2" onSubmit={onTransition}>
              <div className="space-y-1">
                <Label htmlFor="transitionTo">Next status</Label>
                <select
                  id="transitionTo"
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={transitionTo}
                  onChange={(event) =>
                    setTransitionTo(event.target.value as OrderStatus | "")
                  }
                  required
                >
                  <option value="">Select…</option>
                  {order.allowedNextStatuses.map((status) => (
                    <option key={status} value={status}>
                      {productStatusLabel(status)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="transitionReason">Reason (optional)</Label>
                <Input
                  id="transitionReason"
                  value={transitionReason}
                  onChange={(event) => setTransitionReason(event.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" size="sm" disabled={busy || !transitionTo}>
                  Apply transition
                </Button>
              </div>
            </form>
          </DetailSection>
        ) : null}

        {canCorrect ? (
          <DetailSection
            title="Financial correction"
            description="Does not execute Payments. Records an order adjustment only."
          >
            <form
              className="grid gap-3 sm:grid-cols-2"
              onSubmit={requestCorrectConfirm}
            >
              <div className="space-y-1">
                <Label htmlFor="correctAmount">Amount (cents)</Label>
                <Input
                  id="correctAmount"
                  type="number"
                  value={correctAmountCents}
                  onChange={(event) => setCorrectAmountCents(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="correctReason">Reason</Label>
                <Input
                  id="correctReason"
                  value={correctReason}
                  onChange={(event) => setCorrectReason(event.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" size="sm" disabled={busy}>
                  Apply correction
                </Button>
              </div>
            </form>
          </DetailSection>
        ) : null}

        {canOverride && order.status !== "FULFILLED" ? (
          <DetailSection
            title="Administrative override (Class D)"
            description="Bypasses normal lifecycle transitions. Use only with a documented reason."
          >
            <form
              className="grid gap-3 sm:grid-cols-2"
              onSubmit={requestOverrideConfirm}
            >
              <div className="space-y-1">
                <Label htmlFor="overrideTo">To status</Label>
                <select
                  id="overrideTo"
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={overrideTo}
                  onChange={(event) =>
                    setOverrideTo(event.target.value as OrderStatus | "")
                  }
                  required
                >
                  <option value="">Select…</option>
                  {ALL_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {productStatusLabel(status)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="overrideReason">Reason (required)</Label>
                <Input
                  id="overrideReason"
                  value={overrideReason}
                  onChange={(event) => setOverrideReason(event.target.value)}
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <Button
                  type="submit"
                  size="sm"
                  variant="destructive"
                  disabled={busy || !overrideTo || !overrideReason.trim()}
                >
                  Apply override
                </Button>
              </div>
            </form>
          </DetailSection>
        ) : null}

        <DetailSection id="notes" title="Notes & activity">
          <NotesTimeline
            notes={notes}
            activities={activity}
            composerDisabled={!canEdit}
            addingNote={addingNote}
            onAddNote={canEdit ? handleAddNote : undefined}
          />
        </DetailSection>

        <DetailSection title="Hardcopy documents">
          <p className="text-sm text-muted-foreground">
            Hardcopy document management is not available in this phase.
          </p>
        </DetailSection>

        <DetailSection title="Scanned documents">
          <p className="text-sm text-muted-foreground">
            Scanned document upload and viewing is not available in this phase.
          </p>
        </DetailSection>

        <DetailSection title="Related entities">
          <RelatedEntityTree
            context="guardian"
            user={{
              id: order.patientUserId,
              label: customerLabel(order),
            }}
            parentOrder={
              order.orderType === "SUBSCRIPTION_INITIAL"
                ? { id: order.id, label: order.orderNumber }
                : undefined
            }
            subscription={
              order.subscriptionId
                ? { id: order.subscriptionId, label: order.subscriptionId }
                : undefined
            }
          />
        </DetailSection>

        <DetailSection
          id="history"
          title="History"
          description="Status transitions only — not Platform Audit."
        >
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No history yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {history.map((row) => (
                <li key={row.id} className="border-b border-border pb-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {row.fromStatus ? (
                      <StatusBadge status={row.fromStatus} />
                    ) : (
                      "—"
                    )}
                    <span aria-hidden>→</span>
                    <StatusBadge status={row.toStatus} />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {row.source}
                    {row.actorUserId ? ` · ${row.actorUserId}` : ""} ·{" "}
                    {formatDateTime(row.createdAt)}
                    {row.reason ? ` · ${row.reason}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DetailSection>

        <DetailSection
          id="activity"
          title="Activity"
          description="Operational events — separate from History and Platform Audit."
        >
          {activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {activity.map((row) => (
                <li key={row.id} className="border-b border-border pb-2">
                  <div>
                    <span className="font-medium">{row.kind}</span> —{" "}
                    {row.summary}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {row.actorUserId ?? "system"} ·{" "}
                    {formatDateTime(row.createdAt)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DetailSection>
      </PageBody>

      <ConfirmDialog
        open={archiveConfirmOpen}
        onOpenChange={setArchiveConfirmOpen}
        title={`Archive order ${order.orderNumber}?`}
        description="This is a Class D administrative action."
        confirmLabel="Archive"
        loading={busy}
        onConfirm={onArchiveConfirm}
      />
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title={`Soft-delete order ${order.orderNumber}?`}
        description="This is a Class D administrative action."
        confirmLabel="Soft-delete"
        destructive
        loading={busy}
        onConfirm={onSoftDeleteConfirm}
      />
      <ConfirmDialog
        open={restoreConfirmOpen}
        onOpenChange={setRestoreConfirmOpen}
        title={`Restore order ${order.orderNumber}?`}
        description="This is a Class D administrative action."
        confirmLabel="Restore"
        loading={busy}
        onConfirm={onRestoreConfirm}
      />
      <ConfirmDialog
        open={correctConfirmOpen}
        onOpenChange={setCorrectConfirmOpen}
        title={`Apply financial correction of ${correctAmountNumber} cents to ${order.orderNumber}?`}
        description="Does not execute Payments."
        confirmLabel="Apply correction"
        loading={busy}
        onConfirm={onCorrectConfirm}
      />
      <ConfirmDialog
        open={overrideConfirmOpen}
        onOpenChange={setOverrideConfirmOpen}
        title={`Administrative override (Class D): set ${order.orderNumber} to ${overrideTo}?`}
        description="Bypasses normal lifecycle transitions."
        confirmLabel="Apply override"
        destructive
        loading={busy}
        onConfirm={onOverrideConfirm}
      />

      <ReasonPromptDialog
        open={reasonPromptOpen}
        label={reasonPromptLabel}
        onSubmit={(reason) => resolveReasonPrompt(reason)}
        onCancel={() => resolveReasonPrompt(null)}
      />
    </ClinexaPage>
  );
}
