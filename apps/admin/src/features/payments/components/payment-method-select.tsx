"use client";

import { useEffect, useState } from "react";

import { Label } from "@/components/ui/label";
import { listAdminPaymentMethods } from "@/features/payments/api/admin-payments-api";
import { listCrmPaymentMethods } from "@/features/payments/api/crm-payments-api";
import type { SavedPaymentMethod } from "@/features/users/types";

type Props = {
  userId: string;
  value: string;
  onChange: (methodId: string) => void;
  context: "crm" | "admin";
  label?: string;
  disabled?: boolean;
};

type LoadedMethods = {
  userId: string;
  context: "crm" | "admin";
  methods: SavedPaymentMethod[];
};

function optionLabel(method: SavedPaymentMethod): string {
  const brand = method.brand ?? "Card";
  const last4 = method.last4 ? ` •••• ${method.last4}` : "";
  const def = method.isDefault ? " (default)" : "";
  return `${brand}${last4}${def}`;
}

export function PaymentMethodSelect({
  userId,
  value,
  onChange,
  context,
  label = "Payment method",
  disabled = false,
}: Props) {
  const [loaded, setLoaded] = useState<LoadedMethods | null>(null);

  const loading =
    !loaded || loaded.userId !== userId || loaded.context !== context;
  const methods = loading ? [] : loaded.methods;

  useEffect(() => {
    let cancelled = false;
    void (context === "crm"
      ? listCrmPaymentMethods(userId)
      : listAdminPaymentMethods(userId)
    )
      .then((rows) => {
        if (cancelled) return;
        setLoaded({ userId, context, methods: rows });
      })
      .catch(() => {
        if (cancelled) return;
        setLoaded({ userId, context, methods: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [userId, context]);

  return (
    <div className="space-y-1">
      <Label htmlFor="payment-method-select">{label}</Label>
      <select
        id="payment-method-select"
        className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
        value={value}
        disabled={disabled || loading || methods.length === 0}
        onChange={(e) => onChange(e.target.value)}
      >
        {methods.length === 0 ? (
          <option value="">No saved methods</option>
        ) : (
          methods.map((method) => (
            <option key={method.id} value={method.id}>
              {optionLabel(method)}
            </option>
          ))
        )}
      </select>
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading methods…</p>
      ) : null}
    </div>
  );
}
