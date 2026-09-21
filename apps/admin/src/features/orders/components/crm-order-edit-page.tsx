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
import { formatDateTime, productStatusLabel } from "@/features/orders/lib/format";
import type { OrderAddressInput, OrderDetail } from "@/features/orders/types";
import { AdminTagsEditor } from "@/features/shared/components/admin-tags-editor";
import {
  ModuleDetailSearch,
  type ModuleSearchResult,
} from "@/features/shared/components/module-detail-search";
import { listCrmUsers } from "@/features/users/api/users-api";

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

const EMPTY_ADDRESS: OrderAddressInput = {
  line1: "",
  line2: "",
  city: "",
  region: "",
  postalCode: "",
  country: "",
  phone: "",
  fullName: "",
};

function addressFromOrder(
  addresses: OrderDetail["addresses"],
  kind: "SHIPPING" | "BILLING",
): OrderAddressInput {
  const row = addresses.find((a) => a.kind === kind);
  if (!row) return { ...EMPTY_ADDRESS };
  return {
    fullName: row.fullName ?? "",
    line1: row.line1,
    line2: row.line2 ?? "",
    city: row.city,
    region: row.region ?? "",
    postalCode: row.postalCode ?? "",
    country: row.country,
    phone: row.phone ?? "",
  };
}

function addressToPayload(
  address: OrderAddressInput,
): OrderAddressInput | null {
  if (!address.line1.trim() || !address.city.trim() || !address.country.trim()) {
    return null;
  }
  return {
    fullName: address.fullName?.trim() || null,
    line1: address.line1.trim(),
    line2: address.line2?.trim() || null,
    city: address.city.trim(),
    region: address.region?.trim() || null,
    postalCode: address.postalCode?.trim() || null,
    country: address.country.trim(),
    phone: address.phone?.trim() || null,
  };
}

function userLabel(user: {
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string;
}): string {
  return (
    user.displayName ||
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    user.email
  );
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
  const [patientUserId, setPatientUserId] = useState("");
  const [patientLabel, setPatientLabel] = useState("");
  const [shippingAddress, setShippingAddress] =
    useState<OrderAddressInput>(EMPTY_ADDRESS);
  const [billingAddress, setBillingAddress] =
    useState<OrderAddressInput>(EMPTY_ADDRESS);
  const [adminTags, setAdminTags] = useState<
    Record<string, unknown> | string[] | null
  >(null);
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
        setPatientUserId(detail.patientUserId);
        setPatientLabel(userLabel(detail.patient));
        setShippingAddress(addressFromOrder(detail.addresses, "SHIPPING"));
        setBillingAddress(addressFromOrder(detail.addresses, "BILLING"));
        setAdminTags(
          (detail.adminTags as Record<string, unknown> | string[] | null) ??
            null,
        );
      })
      .catch((err) => setError(getErrorMessage(err, "Unable to load order.")))
      .finally(() => setLoading(false));
  }, [orderId]);

  async function searchUsers(q: string): Promise<ModuleSearchResult[]> {
    const result = await listCrmUsers({ q, take: 8 });
    return result.items.map((item) => ({
      id: item.id,
      label: userLabel(item),
      sublabel: item.email,
    }));
  }

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
        patientUserId: patientUserId || order.patientUserId,
        shippingAddress: addressToPayload(shippingAddress),
        billingAddress: addressToPayload(billingAddress),
        adminTags,
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
          Status {productStatusLabel(order.status)} · updated{" "}
          {formatDateTime(order.updatedAt)}. Includes patient reassignment,
          addresses, and admin tags where policy allows.
        </p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-2 rounded-md border border-border p-3">
          <div className="text-sm font-medium">Patient user</div>
          <p className="text-xs text-muted-foreground">
            Current: {patientLabel} ({patientUserId})
          </p>
          <ModuleDetailSearch
            placeholder="Search patient by name, email, phone, id…"
            searchFn={searchUsers}
            onSelect={(id) => {
              setPatientUserId(id);
              void listCrmUsers({ q: id, take: 1 }).then((result) => {
                const match = result.items.find((row) => row.id === id);
                if (match) setPatientLabel(userLabel(match));
              });
            }}
          />
        </div>

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

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <div className="text-sm font-medium">Shipping address</div>
            {(Object.keys(EMPTY_ADDRESS) as Array<keyof OrderAddressInput>).map(
              (field) => (
                <Input
                  key={field}
                  placeholder={field}
                  value={shippingAddress[field] ?? ""}
                  onChange={(e) =>
                    setShippingAddress((prev) => ({
                      ...prev,
                      [field]: e.target.value,
                    }))
                  }
                />
              ),
            )}
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">Billing address</div>
            {(Object.keys(EMPTY_ADDRESS) as Array<keyof OrderAddressInput>).map(
              (field) => (
                <Input
                  key={field}
                  placeholder={field}
                  value={billingAddress[field] ?? ""}
                  onChange={(e) =>
                    setBillingAddress((prev) => ({
                      ...prev,
                      [field]: e.target.value,
                    }))
                  }
                />
              ),
            )}
          </div>
        </div>

        <AdminTagsEditor value={adminTags} onChange={setAdminTags} />

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
