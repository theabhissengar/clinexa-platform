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
  addCrmOrderNote,
  cancelCrmOrder,
  fulfillCrmOrder,
  getCrmOrder,
  listCrmOrderActivity,
  listCrmOrderHistory,
  listCrmOrderNotes,
  updateCrmOrder,
} from "@/features/orders/api/orders-api";
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
  OrderStatusHistory,
} from "@/features/orders/types";

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

export function CrmOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const orderId = params.id;
  const { can } = usePermissions();

  const returnQs = searchParams.get("return");
  const backHref =
    returnQs && returnQs.startsWith("?")
      ? `/crm/orders${returnQs}`
      : "/crm/orders";

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [notes, setNotes] = useState<OrderNote[]>([]);
  const [history, setHistory] = useState<OrderStatusHistory[]>([]);
  const [activity, setActivity] = useState<OrderActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [noteBody, setNoteBody] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [carrier, setCarrier] = useState("");
  const [shippingPhone, setShippingPhone] = useState("");
  const [cancelReason, setCancelReason] = useState("");

  const canEdit = can(Permissions.ORD_EDIT);
  const canCancel = can(Permissions.ORD_CANCEL);
  const canFulfill = can(Permissions.ORD_FULFILL);

  const load = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) {
      setLoading(true);
    }
    setError(null);
    try {
      const [detail, noteRows, historyRows, activityRows] = await Promise.all([
        getCrmOrder(orderId),
        listCrmOrderNotes(orderId),
        listCrmOrderHistory(orderId),
        listCrmOrderActivity(orderId),
      ]);
      setOrder(detail);
      setNotes(noteRows);
      setHistory(historyRows);
      setActivity(activityRows);
      setTrackingNumber(detail.trackingNumber ?? "");
      setCarrier(detail.carrier ?? "");
      const shipping = detail.addresses.find((a) => a.kind === "SHIPPING");
      setShippingPhone(shipping?.phone ?? "");
    } catch (err) {
      setOrder(null);
      setError(getErrorMessage(err, "Unable to load order."));
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const [detail, noteRows, historyRows, activityRows] = await Promise.all([
          getCrmOrder(orderId),
          listCrmOrderNotes(orderId),
          listCrmOrderHistory(orderId),
          listCrmOrderActivity(orderId),
        ]);
        if (cancelled) return;
        setOrder(detail);
        setNotes(noteRows);
        setHistory(historyRows);
        setActivity(activityRows);
        setTrackingNumber(detail.trackingNumber ?? "");
        setCarrier(detail.carrier ?? "");
        const shipping = detail.addresses.find((a) => a.kind === "SHIPPING");
        setShippingPhone(shipping?.phone ?? "");
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

  async function onSaveOps(event: React.FormEvent) {
    event.preventDefault();
    if (!order || !canEdit) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await updateCrmOrder(order.id, {
        trackingNumber: trackingNumber || null,
        carrier: carrier || null,
        shippingPhone: shippingPhone || null,
      });
      setMessage("Order updated.");
      await load({ quiet: true });
    } catch (err) {
      setError(getErrorMessage(err, "Unable to update order."));
    } finally {
      setBusy(false);
    }
  }

  async function onCancel() {
    if (!order || !canCancel) return;
    if (
      !window.confirm(
        `Cancel order ${order.orderNumber}? This uses the Orders lifecycle cancel transition.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await cancelCrmOrder(order.id, cancelReason || undefined);
      setMessage("Order cancelled.");
      setCancelReason("");
      await load({ quiet: true });
    } catch (err) {
      setError(getErrorMessage(err, "Unable to cancel order."));
    } finally {
      setBusy(false);
    }
  }

  async function onFulfill() {
    if (!order || !canFulfill) return;
    if (
      !window.confirm(
        `Mark order ${order.orderNumber} as fulfilled? Inventory commit is deferred to a later phase.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await fulfillCrmOrder(order.id, {
        trackingNumber: trackingNumber || undefined,
        carrier: carrier || undefined,
      });
      setMessage("Order fulfilled.");
      await load({ quiet: true });
    } catch (err) {
      setError(getErrorMessage(err, "Unable to fulfill order."));
    } finally {
      setBusy(false);
    }
  }

  async function onAddNote(event: React.FormEvent) {
    event.preventDefault();
    if (!order || !canEdit || !noteBody.trim()) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await addCrmOrderNote(order.id, noteBody.trim());
      setNoteBody("");
      setMessage("Note added.");
      await load({ quiet: true });
    } catch (err) {
      setError(getErrorMessage(err, "Unable to add note."));
    } finally {
      setBusy(false);
    }
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
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit ? (
            <Button
              size="sm"
              variant="outline"
              render={<Link href={`/crm/orders/${order.id}/edit`} />}
            >
              Edit ops fields
            </Button>
          ) : null}
          {canFulfill && order.canFulfill ? (
            <Button size="sm" disabled={busy} onClick={() => void onFulfill()}>
              Fulfill / ship
            </Button>
          ) : null}
          {canCancel && order.canCancel ? (
            <Button
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={() => void onCancel()}
            >
              Cancel order
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
        {canCancel && order.canCancel ? (
          <div className="mt-4 space-y-2 border-t border-border pt-3">
            <Label htmlFor="cancel-reason">Cancel reason (optional)</Label>
            <Input
              id="cancel-reason"
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              placeholder="Reason for cancellation"
            />
          </div>
        ) : null}
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

      <Section title="Subscription">
        <p className="text-sm">
          Type: {statusLabel(order.orderType)}
          <br />
          Subscription ref:{" "}
          <span className="font-mono text-xs">
            {order.subscriptionId ?? "—"}
          </span>
        </p>
      </Section>

      <Section title="Inventory">
        <p className="text-sm">
          Reservation ref:{" "}
          <span className="font-mono text-xs">
            {order.reservationId ?? "—"}
          </span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Inventory mutations are deferred (P13e). CRM does not write stock
          tables.
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

      {canEdit ? (
        <Section title="Operational fulfillment fields">
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={onSaveOps}>
            <div className="space-y-1">
              <Label htmlFor="tracking">Tracking number</Label>
              <Input
                id="tracking"
                value={trackingNumber}
                onChange={(event) => setTrackingNumber(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="carrier">Carrier</Label>
              <Input
                id="carrier"
                value={carrier}
                onChange={(event) => setCarrier(event.target.value)}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="ship-phone">Shipping phone assist</Label>
              <Input
                id="ship-phone"
                value={shippingPhone}
                onChange={(event) => setShippingPhone(event.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" size="sm" disabled={busy}>
                Save operational fields
              </Button>
            </div>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">
            Domain lifecycle rules still apply — invalid status edits are
            rejected by the API.
          </p>
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
