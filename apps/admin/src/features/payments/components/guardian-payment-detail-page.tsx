"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePermissions } from "@/features/auth/hooks/use-permissions";
import { Permissions } from "@/features/auth/permissions";
import {
  getAdminPayment,
  initiateAdminRefund,
} from "@/features/payments/api/admin-payments-api";
import type { PaymentDetail } from "@/features/payments/types";
import {
  formatDateTime,
  formatMoneyCents,
  statusLabel,
} from "@/features/orders/lib/format";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-border bg-background p-4">
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

export function GuardianPaymentDetailPage() {
  const params = useParams<{ id: string }>();
  const { can } = usePermissions();
  const [payment, setPayment] = useState<PaymentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showRefund, setShowRefund] = useState(false);
  const [amountCents, setAmountCents] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const canRefund = can(Permissions.PAY_INITIATE_REFUND);

  const load = useCallback(async () => {
    const detail = await getAdminPayment(params.id);
    setPayment(detail);
  }, [params.id]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const detail = await getAdminPayment(params.id);
        if (cancelled) return;
        setPayment(detail);
        setAmountCents(
          detail.refundableCents > 0 ? String(detail.refundableCents) : "",
        );
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(getErrorMessage(err, "Unable to load payment."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  async function onRefund(event: React.FormEvent) {
    event.preventDefault();
    if (!payment || !canRefund) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const key = `${payment.id}:${crypto.randomUUID()}`;
      await initiateAdminRefund(
        payment.id,
        { amountCents: Number(amountCents), reason },
        key,
      );
      setMessage("Refund submitted.");
      setShowRefund(false);
      setReason("");
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Unable to refund payment."));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="px-6 py-10 text-sm text-muted-foreground">
        Loading payment…
      </main>
    );
  }
  if (!payment) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-3 px-4 py-8">
        <Link
          href="/guardian/payments"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← All payments
        </Link>
        <p className="text-sm text-destructive">
          {error ?? "Payment not found."}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/guardian/payments"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            ← All payments
          </Link>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">
            Payment
          </h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {payment.id}
          </p>
        </div>
        {canRefund && payment.refundableCents > 0 ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowRefund((open) => !open)}
          >
            Refund
          </Button>
        ) : null}
      </div>
      {message ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">
          {message}
        </p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {showRefund ? (
        <Section title="Initiate refund">
          <form
            className="grid max-w-md gap-3"
            onSubmit={(event) => void onRefund(event)}
          >
            <div className="grid gap-1">
              <Label htmlFor="amountCents">Amount (cents)</Label>
              <Input
                id="amountCents"
                type="number"
                min={1}
                max={payment.refundableCents}
                value={amountCents}
                onChange={(e) => setAmountCents(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Remaining refundable{" "}
                {formatMoneyCents(payment.refundableCents, payment.currency)}
              </p>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="reason">Reason</Label>
              <Input
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={busy} size="sm">
              {busy ? "Submitting…" : "Submit refund"}
            </Button>
          </form>
        </Section>
      ) : null}

      <Section title="Identity">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Amount</dt>
            <dd className="tabular-nums">
              {formatMoneyCents(payment.amountCents, payment.currency)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Status</dt>
            <dd>{statusLabel(payment.status)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Lifecycle</dt>
            <dd>{statusLabel(payment.lifecycleState)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Purpose</dt>
            <dd>{statusLabel(payment.purpose)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Provider</dt>
            <dd>{payment.provider}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Created</dt>
            <dd>{formatDateTime(payment.createdAt)}</dd>
          </div>
        </dl>
      </Section>

      <Section title="Linked records">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Order</dt>
            <dd>
              {payment.order ? (
                <Link
                  href={`/guardian/orders/${payment.order.id}`}
                  className="underline-offset-4 hover:underline"
                >
                  {payment.order.orderNumber}
                </Link>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Subscription</dt>
            <dd className="font-mono text-xs">
              {payment.subscription?.id ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Patient</dt>
            <dd>
              {payment.patient
                ? [payment.patient.firstName, payment.patient.lastName]
                    .filter(Boolean)
                    .join(" ") || payment.patient.email
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Idempotency key</dt>
            <dd className="font-mono text-xs">{payment.idempotencyKey}</dd>
          </div>
        </dl>
      </Section>

      <Section title="Refunds">
        {payment.refunds.length === 0 ? (
          <p className="text-sm text-muted-foreground">No refunds.</p>
        ) : (
          <ul className="grid gap-2 text-sm">
            {payment.refunds.map((refund) => (
              <li key={refund.id}>
                {formatMoneyCents(refund.amountCents, payment.currency)} ·{" "}
                {statusLabel(refund.status)} · {refund.reason ?? "—"} ·{" "}
                {formatDateTime(refund.createdAt)}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Webhook events">
        {payment.webhookEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No webhook events.</p>
        ) : (
          <ul className="grid gap-2 text-sm">
            {payment.webhookEvents.map((event) => (
              <li key={event.id} className="font-mono text-xs">
                {event.eventType} · {event.providerEventId} ·{" "}
                {formatDateTime(event.createdAt)}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </main>
  );
}
