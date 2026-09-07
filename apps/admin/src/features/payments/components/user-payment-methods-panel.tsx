"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addAdminPaymentMethod,
  deleteAdminPaymentMethod,
  makeAdminPaymentMethodDefault,
} from "@/features/payments/api/admin-payments-api";
import {
  addCrmPaymentMethod,
  deleteCrmPaymentMethod,
  makeCrmPaymentMethodDefault,
} from "@/features/payments/api/crm-payments-api";
import type { SavedPaymentMethod } from "@/features/users/types";

type Props = {
  userId: string;
  methods: SavedPaymentMethod[];
  context: "crm" | "admin";
  onChanged: () => Promise<void>;
};

function methodLabel(method: SavedPaymentMethod): string {
  const brand = method.brand ?? "Card";
  const last4 = method.last4 ? ` •••• ${method.last4}` : "";
  return `${brand}${last4}`;
}

export function UserPaymentMethodsPanel({
  userId,
  methods,
  context,
  onChanged,
}: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [brand, setBrand] = useState("Visa");
  const [last4, setLast4] = useState("");
  const [expMonth, setExpMonth] = useState("");
  const [expYear, setExpYear] = useState("");
  const [makeDefault, setMakeDefault] = useState(false);

  async function runAction(
    methodId: string,
    action: () => Promise<unknown>,
  ) {
    setBusyId(methodId);
    setError(null);
    try {
      await action();
      await onChanged();
    } catch {
      setError("Unable to update payment method.");
    } finally {
      setBusyId(null);
    }
  }

  async function onAdd(event: React.FormEvent) {
    event.preventDefault();
    if (!last4.trim() || last4.trim().length !== 4) {
      setError("Last 4 digits are required.");
      return;
    }
    setAdding(true);
    setError(null);
    const payload = {
      brand: brand.trim() || undefined,
      last4: last4.trim(),
      expMonth: expMonth ? Number(expMonth) : undefined,
      expYear: expYear ? Number(expYear) : undefined,
      isDefault: makeDefault || methods.length === 0,
    };
    try {
      if (context === "crm") {
        await addCrmPaymentMethod(userId, payload);
      } else {
        await addAdminPaymentMethod(userId, payload);
      }
      setBrand("Visa");
      setLast4("");
      setExpMonth("");
      setExpYear("");
      setMakeDefault(false);
      await onChanged();
    } catch {
      setError("Unable to add payment method.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {methods.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No saved payment methods.
        </p>
      ) : (
        <ul className="space-y-2 text-sm">
          {methods.map((method) => (
            <li
              key={method.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
            >
              <div>
                <div className="font-medium">
                  {methodLabel(method)}
                  {method.isDefault ? (
                    <span className="ml-2 text-xs text-muted-foreground">
                      Default
                    </span>
                  ) : null}
                </div>
                <div className="text-xs text-muted-foreground">
                  Expires{" "}
                  {method.expMonth && method.expYear
                    ? `${method.expMonth}/${method.expYear}`
                    : "—"}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {!method.isDefault ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busyId === method.id}
                    onClick={() =>
                      void runAction(method.id, () =>
                        context === "crm"
                          ? makeCrmPaymentMethodDefault(userId, method.id)
                          : makeAdminPaymentMethodDefault(userId, method.id),
                      )
                    }
                  >
                    Make default
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busyId === method.id || method.isDefault}
                  onClick={() =>
                    void runAction(method.id, () =>
                      context === "crm"
                        ? deleteCrmPaymentMethod(userId, method.id)
                        : deleteAdminPaymentMethod(userId, method.id),
                    )
                  }
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form
        className="space-y-3 rounded-md border border-dashed border-border p-3"
        onSubmit={onAdd}
      >
        <div className="text-sm font-medium">Add simulated method</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="pm-brand">Brand</Label>
            <Input
              id="pm-brand"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="Visa"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pm-last4">Last 4</Label>
            <Input
              id="pm-last4"
              value={last4}
              onChange={(e) =>
                setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))
              }
              placeholder="4242"
              maxLength={4}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pm-exp-month">Exp month</Label>
            <Input
              id="pm-exp-month"
              value={expMonth}
              onChange={(e) => setExpMonth(e.target.value)}
              placeholder="12"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pm-exp-year">Exp year</Label>
            <Input
              id="pm-exp-year"
              value={expYear}
              onChange={(e) => setExpYear(e.target.value)}
              placeholder="2028"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={makeDefault}
            onChange={(e) => setMakeDefault(e.target.checked)}
          />
          Set as default
        </label>
        <Button type="submit" size="sm" disabled={adding}>
          {adding ? "Adding…" : "Add method"}
        </Button>
      </form>
    </div>
  );
}
