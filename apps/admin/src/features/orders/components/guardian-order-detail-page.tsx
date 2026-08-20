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
  addAdminOrderNote,
  archiveAdminOrder,
  correctAdminOrder,
  deleteAdminOrder,
  getAdminOrder,
  listAdminOrderActivity,
  listAdminOrderHistory,
  listAdminOrderNotes,
  overrideAdminOrder,
  restoreAdminOrder,
  transitionAdminOrder,
} from "@/features/orders/api/admin-orders-api";
import {
  customerLabel,
  formatDateTime,
  formatMoneyCents,
  statusLabel,
} from "@/features/orders/lib/format";
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

function promptReason(label: string): string | null {
  const reason = window.prompt(label);
  if (reason == null) return null;
  return reason.trim();
}

function formatJson(value: unknown): string {
  if (value == null) return "—";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function GuardianOrderDetailPage() {
  const params = useParams<{ id: string }>();
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

  const [noteBody, setNoteBody] = useState("");
  const [transitionTo, setTransitionTo] = useState<OrderStatus | "">("");
  const [transitionReason, setTransitionReason] = useState("");
  const [correctAmountCents, setCorrectAmountCents] = useState("");
  const [correctReason, setCorrectReason] = useState("");
  const [overrideTo, setOverrideTo] = useState<OrderStatus | "">("");
  const [overrideReason, setOverrideReason] = useState("");

  const canEdit = can(Permissions.ORD_EDIT);
  const canArchive = can(Permissions.ORD_ARCHIVE);
  const canDelete = can(Permissions.ORD_DELETE);
  const canRestore = can(Permissions.ORD_RESTORE);
  const canCorrect = can(Permissions.ORD_CORRECT);
  const canOverride = can(Permissions.ORD_OVERRIDE);

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

  async function onArchive() {
    if (!order || !canArchive) return;
    if (
      !window.confirm(
        `Archive order ${order.orderNumber}? This is a Class D administrative action.`,
      )
    ) {
      return;
    }
    const reason = promptReason("Archive reason (optional):");
    if (reason == null) return;
    await runAction(
      () => archiveAdminOrder(order.id, reason || undefined),
      "Order archived.",
      "Unable to archive order.",
    );
  }

  async function onSoftDelete() {
    if (!order || !canDelete) return;
    if (
      !window.confirm(
        `Soft-delete order ${order.orderNumber}? This is a Class D administrative action.`,
      )
    ) {
      return;
    }
    const reason = promptReason("Soft-delete reason (optional):");
    if (reason == null) return;
    await runAction(
      () => deleteAdminOrder(order.id, reason || undefined),
      "Order soft-deleted.",
      "Unable to soft-delete order.",
    );
  }

  async function onRestore() {
    if (!order || !canRestore) return;
    if (
      !window.confirm(
        `Restore order ${order.orderNumber}? This is a Class D administrative action.`,
      )
    ) {
      return;
    }
    const reason = promptReason("Restore reason (optional):");
    if (reason == null) return;
    await runAction(
      () => restoreAdminOrder(order.id, reason || undefined),
      "Order restored.",
      "Unable to restore order.",
    );
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

  async function onCorrect(event: React.FormEvent) {
    event.preventDefault();
    if (!order || !canCorrect) return;
    const amountCents = Number(correctAmountCents);
    if (!Number.isFinite(amountCents) || amountCents === 0) {
      setError("Correction amount (cents) must be a non-zero number.");
      return;
    }
    if (
      !window.confirm(
        `Apply financial correction of ${amountCents} cents to ${order.orderNumber}? Does not execute Payments.`,
      )
    ) {
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

  async function onOverride(event: React.FormEvent) {
    event.preventDefault();
    if (!order || !canOverride || !overrideTo) return;
    if (!overrideReason.trim()) {
      setError("Override reason is required.");
      return;
    }
    if (
      !window.confirm(
        `Administrative override (Class D): set ${order.orderNumber} to ${overrideTo}?`,
      )
    ) {
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

  async function onAddNote(event: React.FormEvent) {
    event.preventDefault();
    if (!order || !canEdit || !noteBody.trim()) return;
    await runAction(
      () => addAdminOrderNote(order.id, noteBody.trim()),
      "Note added.",
      "Unable to add note.",
    );
    setNoteBody("");
  }

  if (loading) {
    return (
      <main className="px-6 py-10 text-sm text-muted-foreground">
        Loading order…
      </main>
    );
  }

  if (!order) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-3 px-4 py-8 md:px-6">
        <Link
          href={backHref}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← All orders
        </Link>
        <p className="text-sm text-destructive">
          {error ?? "Order not found."}
        </p>
      </main>
    );
  }

  const shipping = order.addresses.find((a) => a.kind === "SHIPPING");
  const billing = order.addresses.find((a) => a.kind === "BILLING");
  const adjustments = order.adjustments ?? [];

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={backHref}
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            ← All orders
          </Link>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">
            {order.orderNumber}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {statusLabel(order.status)} · {statusLabel(order.orderType)} ·{" "}
            {formatDateTime(order.createdAt)}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
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
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
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
              onClick={() => void onArchive()}
            >
              Archive
            </Button>
          ) : null}
          {canDelete && !order.deletedAt ? (
            <Button
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={() => void onSoftDelete()}
            >
              Soft-delete
            </Button>
          ) : null}
          {canRestore && (order.archivedAt || order.deletedAt) ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void onRestore()}
            >
              Restore
            </Button>
          ) : null}
        </div>
      </div>

      {message ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">
          {message}
        </p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Section title="Order header">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Order ID</dt>
            <dd className="font-mono text-xs">{order.id}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Total</dt>
            <dd className="tabular-nums font-medium">
              {formatMoneyCents(order.totalCents, order.currency)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Customer (snapshot)</dt>
            <dd>{customerLabel(order)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Patient user</dt>
            <dd>
              <Link
                href={`/crm/users/${order.patientUserId}`}
                className="text-primary hover:underline"
              >
                {order.patient.displayName ||
                  order.patient.email ||
                  order.patientUserId}
              </Link>
            </dd>
          </div>
        </dl>
      </Section>

      <Section title="Customer">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Snapshot name</dt>
            <dd>{customerLabel(order)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Snapshot email</dt>
            <dd>{order.customerEmail ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Snapshot phone</dt>
            <dd>{order.customerPhone ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Live account phone</dt>
            <dd>{order.patient.phone ?? "—"}</dd>
          </div>
        </dl>
      </Section>

      <Section title="Order items" id="items">
        <p className="mb-2 text-xs text-muted-foreground">
          Historical snapshots — not live catalog data.
        </p>
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
                    <td className="py-2 pr-2 font-mono text-xs">{item.sku}</td>
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
                    <td className="py-2">{item.isRxEligible ? "Yes" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Shipping address (snapshot)">
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
            <p className="text-sm text-muted-foreground">No shipping snapshot.</p>
          )}
        </Section>
        <Section title="Billing address (snapshot)">
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
            <p className="text-sm text-muted-foreground">No billing snapshot.</p>
          )}
        </Section>
      </div>

      <Section title="Payment summary">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Status summary</dt>
            <dd>{order.paymentStatusSummary ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Payment intent ref</dt>
            <dd className="font-mono text-xs">
              {order.paymentIntentId ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Latest payment ref</dt>
            <dd className="font-mono text-xs">
              {order.latestPaymentId ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Refunded</dt>
            <dd className="tabular-nums">
              {formatMoneyCents(order.refundedTotalCents, order.currency)}
            </dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">
          Payment actions are owned by Payments — not executed here.
        </p>
      </Section>

      <Section title="Clinical references">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Consultation</dt>
            <dd className="font-mono text-xs">
              {order.consultationId ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Prescription</dt>
            <dd className="font-mono text-xs">
              {order.prescriptionId ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Questionnaire response</dt>
            <dd className="font-mono text-xs">
              {order.questionnaireResponseId ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Rx / clinical flags</dt>
            <dd>
              {order.isRxOrder ? "Rx order" : "Non-Rx"}
              {order.requiresClinicalReview ? " · requires review" : ""}
            </dd>
          </div>
        </dl>
      </Section>

      <Section title="Inventory">
        <p className="text-sm">
          Reservation ref:{" "}
          <span className="font-mono text-xs">
            {order.reservationId ?? "—"}
          </span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Inventory mutations follow Orders ↔ Inventory ownership rules.
        </p>
      </Section>

      <Section title="Totals">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="tabular-nums">
              {formatMoneyCents(order.subtotalCents, order.currency)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Discounts</dt>
            <dd className="tabular-nums">
              {formatMoneyCents(order.discountTotalCents, order.currency)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Shipping</dt>
            <dd className="tabular-nums">
              {formatMoneyCents(order.shippingTotalCents, order.currency)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Tax</dt>
            <dd className="tabular-nums">
              {formatMoneyCents(order.taxTotalCents, order.currency)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Adjustments</dt>
            <dd className="tabular-nums">
              {formatMoneyCents(order.adjustmentTotalCents, order.currency)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Total</dt>
            <dd className="tabular-nums font-medium">
              {formatMoneyCents(order.totalCents, order.currency)}
            </dd>
          </div>
        </dl>
      </Section>

      <Section title="Adjustments">
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
                  {row.actorUserId ?? "system"} · {formatDateTime(row.createdAt)}
                  {row.reason ? ` · ${row.reason}` : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Admin metadata">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Tracking / carrier</dt>
            <dd>
              {order.trackingNumber ?? "—"}
              {order.carrier ? ` · ${order.carrier}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Shipped at</dt>
            <dd>{formatDateTime(order.shippedAt)}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Admin tags</dt>
            <dd>
              <pre className="mt-1 overflow-x-auto rounded-md bg-muted/40 p-2 font-mono text-xs">
                {formatJson(order.adminTags)}
              </pre>
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Reconciliation flags</dt>
            <dd>
              <pre className="mt-1 overflow-x-auto rounded-md bg-muted/40 p-2 font-mono text-xs">
                {formatJson(order.reconciliationFlags)}
              </pre>
            </dd>
          </div>
        </dl>
      </Section>

      {canEdit && order.allowedNextStatuses.length > 0 ? (
        <Section title="Normal status transition">
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
                    {statusLabel(status)}
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
        </Section>
      ) : null}

      {canCorrect ? (
        <Section title="Financial correction">
          <p className="mb-3 text-xs text-muted-foreground">
            Does not execute Payments. Records an order adjustment only.
          </p>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={onCorrect}>
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
        </Section>
      ) : null}

      {canOverride ? (
        <Section title="Administrative override (Class D)">
          <p className="mb-3 text-xs text-muted-foreground">
            Bypasses normal lifecycle transitions. Use only with a documented
            reason.
          </p>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={onOverride}>
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
                    {statusLabel(status)}
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
        </Section>
      ) : null}

      <Section title="Notes" id="notes">
        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notes yet.</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {notes.map((note) => (
              <li key={note.id} className="border-b border-border pb-2">
                <p className="whitespace-pre-wrap">{note.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Author {note.authorUserId} · {formatDateTime(note.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
        {canEdit ? (
          <form className="mt-4 space-y-2" onSubmit={onAddNote}>
            <Label htmlFor="note">Add note</Label>
            <textarea
              id="note"
              className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={noteBody}
              onChange={(event) => setNoteBody(event.target.value)}
            />
            <Button type="submit" size="sm" disabled={busy || !noteBody.trim()}>
              Add note
            </Button>
          </form>
        ) : null}
      </Section>

      <Section title="History" id="history">
        <p className="mb-2 text-xs text-muted-foreground">
          Status transitions only — not Platform Audit.
        </p>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No history yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {history.map((row) => (
              <li key={row.id} className="border-b border-border pb-2">
                <div>
                  {row.fromStatus ? statusLabel(row.fromStatus) : "—"} →{" "}
                  {statusLabel(row.toStatus)}
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
      </Section>

      <Section title="Activity" id="activity">
        <p className="mb-2 text-xs text-muted-foreground">
          Operational events — separate from History and Platform Audit.
        </p>
        {activity.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {activity.map((row) => (
              <li key={row.id} className="border-b border-border pb-2">
                <div>
                  <span className="font-medium">{row.kind}</span> — {row.summary}
                </div>
                <div className="text-xs text-muted-foreground">
                  {row.actorUserId ?? "system"} ·{" "}
                  {formatDateTime(row.createdAt)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </main>
  );
}
