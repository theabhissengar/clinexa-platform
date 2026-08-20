"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getCrmOrder,
  updateCrmOrder,
} from "@/features/orders/api/orders-api";
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

export function CrmOrderEditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const orderId = params.id;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [carrier, setCarrier] = useState("");
  const [shippedAt, setShippedAt] = useState("");
  const [shippingPhone, setShippingPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getCrmOrder(orderId)
      .then((detail) => {
        setOrder(detail);
        setTrackingNumber(detail.trackingNumber ?? "");
        setCarrier(detail.carrier ?? "");
        setShippedAt(
          detail.shippedAt ? detail.shippedAt.slice(0, 16) : "",
        );
        const shipping = detail.addresses.find((a) => a.kind === "SHIPPING");
        setShippingPhone(shipping?.phone ?? "");
      })
      .catch((err) => setError(getErrorMessage(err, "Unable to load order.")))
      .finally(() => setLoading(false));
  }, [orderId]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!order) return;
    setSaving(true);
    setError(null);
    try {
      await updateCrmOrder(order.id, {
        trackingNumber: trackingNumber || null,
        carrier: carrier || null,
        shippedAt: shippedAt ? new Date(shippedAt).toISOString() : null,
        shippingPhone: shippingPhone || null,
      });
      router.push(`/crm/orders/${order.id}`);
    } catch (err) {
      setError(getErrorMessage(err, "Unable to save order."));
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
        <Link href="/crm/orders" className="mt-3 inline-block text-sm underline">
          Back to orders
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-8 md:px-6">
      <div>
        <Link
          href={`/crm/orders/${order.id}`}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← {order.orderNumber}
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Edit operational fields
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Status {statusLabel(order.status)} · updated{" "}
          {formatDateTime(order.updatedAt)}. Snapshots, totals, and Class D
          fields are not editable here.
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
        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            variant="outline"
            render={<Link href={`/crm/orders/${order.id}`} />}
          >
            Cancel
          </Button>
        </div>
      </form>
    </main>
  );
}
