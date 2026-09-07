"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { PaymentMethodSelect } from "@/features/payments/components/payment-method-select";

type Props = {
  orderId: string;
  patientUserId: string;
  context: "crm" | "admin";
  onRetry: (paymentMethodId: string) => Promise<void>;
};

export function OrderPaymentRetryPanel({
  orderId,
  patientUserId,
  context,
  onRetry,
}: Props) {
  const [methodId, setMethodId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!methodId) {
      setError("Select a payment method.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await onRetry(methodId);
      setMessage("Payment retry submitted.");
    } catch {
      setError("Unable to retry payment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="mt-3 space-y-3 border-t border-border pt-3" onSubmit={onSubmit}>
      <p className="text-xs text-muted-foreground">
        Retry authorization on this order using a saved payment method. Order{" "}
        <span className="font-mono">{orderId.slice(0, 8)}…</span>
      </p>
      <PaymentMethodSelect
        userId={patientUserId}
        value={methodId}
        onChange={setMethodId}
        context={context}
        label="Payment method (last4)"
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {message ? (
        <p className="text-xs text-emerald-700 dark:text-emerald-400">{message}</p>
      ) : null}
      <Button type="submit" size="sm" disabled={busy || !methodId}>
        {busy ? "Retrying…" : "Retry payment"}
      </Button>
    </form>
  );
}
