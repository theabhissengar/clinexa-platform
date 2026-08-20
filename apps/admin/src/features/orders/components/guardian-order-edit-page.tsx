"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getAdminOrder,
  updateAdminOrder,
} from "@/features/orders/api/admin-orders-api";
import { formatDateTime, statusLabel } from "@/features/orders/lib/format";
import type { OrderDetail } from "@/features/orders/types";

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

function jsonToTextarea(value: unknown): string {
  if (value == null) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}

function parseJsonObject(
  text: string,
  label: string,
): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed === null) return null;
    if (typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`${label} must be a JSON object.`);
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    if (err instanceof Error && err.message.includes(label)) throw err;
    throw new Error(`${label} must be valid JSON.`);
  }
}

export function GuardianOrderEditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const orderId = params.id;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [carrier, setCarrier] = useState("");
  const [shippedAt, setShippedAt] = useState("");
  const [shippingPhone, setShippingPhone] = useState("");
  const [adminTagsText, setAdminTagsText] = useState("");
  const [reconciliationFlagsText, setReconciliationFlagsText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const detail = await getAdminOrder(orderId, true);
        if (cancelled) return;
        setOrder(detail);
        setTrackingNumber(detail.trackingNumber ?? "");
        setCarrier(detail.carrier ?? "");
        setShippedAt(detail.shippedAt ? detail.shippedAt.slice(0, 16) : "");
        const shipping = detail.addresses.find((a) => a.kind === "SHIPPING");
        setShippingPhone(shipping?.phone ?? "");
        setAdminTagsText(jsonToTextarea(detail.adminTags));
        setReconciliationFlagsText(jsonToTextarea(detail.reconciliationFlags));
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

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!order) return;
    setSaving(true);
    setError(null);
    try {
      const adminTags = parseJsonObject(adminTagsText, "Admin tags");
      const reconciliationFlags = parseJsonObject(
        reconciliationFlagsText,
        "Reconciliation flags",
      );
      await updateAdminOrder(order.id, {
        trackingNumber: trackingNumber || null,
        carrier: carrier || null,
        shippedAt: shippedAt ? new Date(shippedAt).toISOString() : null,
        shippingPhone: shippingPhone || null,
        adminTags,
        reconciliationFlags,
      });
      router.push(`/guardian/orders/${order.id}`);
    } catch (err) {
      setError(
        err instanceof Error &&
          (err.message.includes("JSON") || err.message.includes("must be"))
          ? err.message
          : getErrorMessage(err, "Unable to save order."),
      );
    } finally {
      setSaving(false);
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
      <main className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-sm text-destructive">{error ?? "Order not found."}</p>
        <Link
          href="/guardian/orders"
          className="mt-3 inline-block text-sm underline"
        >
          Back to orders
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-8 md:px-6">
      <div>
        <Link
          href={`/guardian/orders/${order.id}`}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← {order.orderNumber}
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Edit order
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Status {statusLabel(order.status)} · updated{" "}
          {formatDateTime(order.updatedAt)}. Includes Guardian admin tags and
          reconciliation flags.
        </p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <form className="space-y-4" onSubmit={onSubmit}>
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
        <div className="space-y-1">
          <Label htmlFor="shippedAt">Shipped at</Label>
          <Input
            id="shippedAt"
            type="datetime-local"
            value={shippedAt}
            onChange={(event) => setShippedAt(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="shippingPhone">Shipping phone</Label>
          <Input
            id="shippingPhone"
            value={shippingPhone}
            onChange={(event) => setShippingPhone(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="adminTags">Admin tags (JSON object)</Label>
          <textarea
            id="adminTags"
            className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
            value={adminTagsText}
            onChange={(event) => setAdminTagsText(event.target.value)}
            placeholder='{"priority":"high"}'
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="reconciliationFlags">
            Reconciliation flags (JSON object)
          </Label>
          <textarea
            id="reconciliationFlags"
            className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
            value={reconciliationFlagsText}
            onChange={(event) =>
              setReconciliationFlagsText(event.target.value)
            }
            placeholder='{"needsReview":true}'
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            variant="outline"
            render={<Link href={`/guardian/orders/${order.id}`} />}
          >
            Cancel
          </Button>
        </div>
      </form>
    </main>
  );
}
