"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createAdminOrder } from "@/features/orders/api/admin-orders-api";
import type { CreateAdminOrderPayload } from "@/features/orders/types";
import { listAdminUsers } from "@/features/users/api/users-api";
import type { AddressSnapshot, AdminUser } from "@/features/users/types";

type AddressDraft = {
  fullName: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  phone: string;
};

type LineDraft = {
  variantId: string;
  quantity: string;
};

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

function emptyAddress(): AddressDraft {
  return {
    fullName: "",
    line1: "",
    line2: "",
    city: "",
    region: "",
    postalCode: "",
    country: "US",
    phone: "",
  };
}

function userDisplayName(user: AdminUser): string {
  return (
    user.displayName ||
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    user.email
  );
}

function addressFromUser(
  user: AdminUser,
  snapshot: AddressSnapshot | null | undefined,
): AddressDraft {
  return {
    fullName: userDisplayName(user),
    line1: snapshot?.line1 ?? "",
    line2: snapshot?.line2 ?? "",
    city: snapshot?.city ?? "",
    region: snapshot?.region ?? user.region ?? "",
    postalCode: snapshot?.postalCode ?? "",
    country: snapshot?.country ?? "US",
    phone: user.phone ?? "",
  };
}

function toAddressPayload(draft: AddressDraft) {
  return {
    fullName: draft.fullName.trim() || undefined,
    line1: draft.line1.trim(),
    line2: draft.line2.trim() || undefined,
    city: draft.city.trim(),
    region: draft.region.trim() || undefined,
    postalCode: draft.postalCode.trim() || undefined,
    country: draft.country.trim() || undefined,
    phone: draft.phone.trim() || undefined,
  };
}

function AddressFields({
  prefix,
  value,
  onChange,
}: {
  prefix: string;
  value: AddressDraft;
  onChange: (next: AddressDraft) => void;
}) {
  function setField<K extends keyof AddressDraft>(key: K, next: string) {
    onChange({ ...value, [key]: next });
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor={`${prefix}-fullName`}>Full name</Label>
        <Input
          id={`${prefix}-fullName`}
          value={value.fullName}
          onChange={(event) => setField("fullName", event.target.value)}
        />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor={`${prefix}-line1`}>Line 1</Label>
        <Input
          id={`${prefix}-line1`}
          required
          value={value.line1}
          onChange={(event) => setField("line1", event.target.value)}
        />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor={`${prefix}-line2`}>Line 2</Label>
        <Input
          id={`${prefix}-line2`}
          value={value.line2}
          onChange={(event) => setField("line2", event.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${prefix}-city`}>City</Label>
        <Input
          id={`${prefix}-city`}
          required
          value={value.city}
          onChange={(event) => setField("city", event.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${prefix}-region`}>Region</Label>
        <Input
          id={`${prefix}-region`}
          value={value.region}
          onChange={(event) => setField("region", event.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${prefix}-postalCode`}>Postal code</Label>
        <Input
          id={`${prefix}-postalCode`}
          value={value.postalCode}
          onChange={(event) => setField("postalCode", event.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${prefix}-country`}>Country</Label>
        <Input
          id={`${prefix}-country`}
          value={value.country}
          onChange={(event) => setField("country", event.target.value)}
        />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor={`${prefix}-phone`}>Phone</Label>
        <Input
          id={`${prefix}-phone`}
          value={value.phone}
          onChange={(event) => setField("phone", event.target.value)}
        />
      </div>
    </div>
  );
}

export function GuardianOrderCreatePage() {
  const router = useRouter();

  const [patientQuery, setPatientQuery] = useState("");
  const [patientResults, setPatientResults] = useState<AdminUser[]>([]);
  const [patientSearchLoading, setPatientSearchLoading] = useState(false);
  const [patientSearchError, setPatientSearchError] = useState<string | null>(
    null,
  );
  const [selectedPatient, setSelectedPatient] = useState<AdminUser | null>(
    null,
  );

  const [lines, setLines] = useState<LineDraft[]>([
    { variantId: "", quantity: "1" },
  ]);
  const [shipping, setShipping] = useState<AddressDraft>(emptyAddress);
  const [billing, setBilling] = useState<AddressDraft>(emptyAddress);
  const [shippingTotalCents, setShippingTotalCents] = useState("");
  const [taxTotalCents, setTaxTotalCents] = useState("");
  const [discountTotalCents, setDiscountTotalCents] = useState("");
  const [initialStatus, setInitialStatus] = useState<
    "DRAFT" | "PAYMENT_PENDING"
  >("DRAFT");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedPatient) return;

    const q = patientQuery.trim();
    if (q.length < 2) return;

    let cancelled = false;
    const handle = window.setTimeout(() => {
      setPatientSearchLoading(true);
      setPatientSearchError(null);
      void listAdminUsers({
        q,
        kind: "patient",
        status: "ACTIVE",
        take: 10,
        skip: 0,
      })
        .then((result) => {
          if (cancelled) return;
          setPatientResults(result.items);
        })
        .catch(() => {
          if (cancelled) return;
          setPatientResults([]);
          setPatientSearchError("Unable to search patients.");
        })
        .finally(() => {
          if (!cancelled) setPatientSearchLoading(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [patientQuery, selectedPatient]);

  function resetPatientSearch() {
    setPatientResults([]);
    setPatientSearchLoading(false);
    setPatientSearchError(null);
  }

  function onPatientQueryChange(next: string) {
    setPatientQuery(next);
    if (next.trim().length < 2) {
      resetPatientSearch();
    }
  }

  function selectPatient(user: AdminUser) {
    setSelectedPatient(user);
    setPatientQuery("");
    resetPatientSearch();
    setShipping(addressFromUser(user, user.shippingAddress));
    setBilling(
      addressFromUser(user, user.billingAddress ?? user.shippingAddress),
    );
  }

  function clearPatient() {
    setSelectedPatient(null);
    setPatientQuery("");
    resetPatientSearch();
  }

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const payloadLines = lines
      .map((line) => ({
        variantId: line.variantId.trim(),
        quantity: Number(line.quantity),
      }))
      .filter((line) => line.variantId);

    if (!selectedPatient) {
      setError("Select a patient from search results.");
      return;
    }
    if (payloadLines.length === 0) {
      setError("Add at least one line with a variant ID.");
      return;
    }
    if (
      payloadLines.some(
        (line) => !Number.isFinite(line.quantity) || line.quantity < 1,
      )
    ) {
      setError("Each line quantity must be a positive number.");
      return;
    }

    const payload: CreateAdminOrderPayload = {
      patientUserId: selectedPatient.id,
      lines: payloadLines,
      shippingAddress: toAddressPayload(shipping),
      billingAddress: toAddressPayload(billing),
      initialStatus,
    };
    if (shippingTotalCents.trim()) {
      payload.shippingTotalCents = Number(shippingTotalCents);
    }
    if (taxTotalCents.trim()) {
      payload.taxTotalCents = Number(taxTotalCents);
    }
    if (discountTotalCents.trim()) {
      payload.discountTotalCents = Number(discountTotalCents);
    }

    setSaving(true);
    try {
      const created = await createAdminOrder(payload);
      router.push(`/guardian/orders/${created.id}`);
    } catch (err) {
      setError(getErrorMessage(err, "Unable to create order."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-8 md:px-6">
      <div>
        <Link
          href="/guardian/orders"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← All orders
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Create order
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Guardian administrative create. Search for a patient by name or email,
          then add line items. Totals follow domain rules on the API.
        </p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <form className="space-y-6" onSubmit={onSubmit}>
        <section className="rounded-md border border-border p-4">
          <h2 className="text-sm font-semibold tracking-tight">Patient</h2>
          <div className="mt-3 space-y-3">
            {selectedPatient ? (
              <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
                <div className="text-sm">
                  <div className="font-medium">
                    {userDisplayName(selectedPatient)}
                  </div>
                  <div className="text-muted-foreground">
                    {selectedPatient.email}
                    {selectedPatient.phone
                      ? ` · ${selectedPatient.phone}`
                      : ""}
                  </div>
                  <div className="mt-1 font-mono text-xs text-muted-foreground">
                    {selectedPatient.id}
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={clearPatient}
                >
                  Change
                </Button>
              </div>
            ) : (
              <div className="relative space-y-1">
                <Label htmlFor="patientSearch">Search by name or email</Label>
                <Input
                  id="patientSearch"
                  value={patientQuery}
                  onChange={(event) => onPatientQueryChange(event.target.value)}
                  placeholder="e.g. Avery, or dev.patient.001@clinexa.test"
                  autoComplete="off"
                />
                {patientSearchLoading ? (
                  <p className="text-xs text-muted-foreground">Searching…</p>
                ) : null}
                {patientSearchError ? (
                  <p className="text-xs text-destructive">
                    {patientSearchError}
                  </p>
                ) : null}
                {patientQuery.trim().length >= 2 &&
                !patientSearchLoading &&
                patientResults.length === 0 &&
                !patientSearchError ? (
                  <p className="text-xs text-muted-foreground">
                    No patients found.
                  </p>
                ) : null}
                {patientResults.length > 0 ? (
                  <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-background shadow-md">
                    {patientResults.map((user) => (
                      <li key={user.id}>
                        <button
                          type="button"
                          className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted"
                          onClick={() => selectPatient(user)}
                        >
                          <span className="font-medium">
                            {userDisplayName(user)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {user.email}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-md border border-border p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold tracking-tight">Line items</h2>
            {lines.length < 3 ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setLines((prev) => [
                    ...prev,
                    { variantId: "", quantity: "1" },
                  ])
                }
              >
                Add line
              </Button>
            ) : null}
          </div>
          <div className="mt-3 space-y-3">
            {lines.map((line, index) => (
              <div
                key={index}
                className="grid gap-3 sm:grid-cols-[1fr_120px_auto]"
              >
                <div className="space-y-1">
                  <Label htmlFor={`variant-${index}`}>Variant ID</Label>
                  <Input
                    id={`variant-${index}`}
                    required={index === 0}
                    value={line.variantId}
                    onChange={(event) =>
                      updateLine(index, { variantId: event.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`qty-${index}`}>Quantity</Label>
                  <Input
                    id={`qty-${index}`}
                    type="number"
                    min={1}
                    required={index === 0 || Boolean(line.variantId.trim())}
                    value={line.quantity}
                    onChange={(event) =>
                      updateLine(index, { quantity: event.target.value })
                    }
                  />
                </div>
                {lines.length > 1 ? (
                  <div className="flex items-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setLines((prev) => prev.filter((_, i) => i !== index))
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-md border border-border p-4">
          <h2 className="text-sm font-semibold tracking-tight">
            Shipping address
          </h2>
          <div className="mt-3">
            <AddressFields
              prefix="shipping"
              value={shipping}
              onChange={setShipping}
            />
          </div>
        </section>

        <section className="rounded-md border border-border p-4">
          <h2 className="text-sm font-semibold tracking-tight">
            Billing address
          </h2>
          <div className="mt-3">
            <AddressFields
              prefix="billing"
              value={billing}
              onChange={setBilling}
            />
          </div>
        </section>

        <section className="rounded-md border border-border p-4">
          <h2 className="text-sm font-semibold tracking-tight">
            Optional totals & status
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="shippingTotalCents">Shipping (cents)</Label>
              <Input
                id="shippingTotalCents"
                type="number"
                value={shippingTotalCents}
                onChange={(event) => setShippingTotalCents(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="taxTotalCents">Tax (cents)</Label>
              <Input
                id="taxTotalCents"
                type="number"
                value={taxTotalCents}
                onChange={(event) => setTaxTotalCents(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="discountTotalCents">Discount (cents)</Label>
              <Input
                id="discountTotalCents"
                type="number"
                value={discountTotalCents}
                onChange={(event) => setDiscountTotalCents(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="initialStatus">Initial status</Label>
              <select
                id="initialStatus"
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={initialStatus}
                onChange={(event) =>
                  setInitialStatus(
                    event.target.value as "DRAFT" | "PAYMENT_PENDING",
                  )
                }
              >
                <option value="DRAFT">DRAFT</option>
                <option value="PAYMENT_PENDING">PAYMENT_PENDING</option>
              </select>
            </div>
          </div>
        </section>

        <div className="flex gap-2">
          <Button type="submit" disabled={saving || !selectedPatient}>
            {saving ? "Creating…" : "Create order"}
          </Button>
          <Button
            type="button"
            variant="outline"
            render={<Link href="/guardian/orders" />}
          >
            Cancel
          </Button>
        </div>
      </form>
    </main>
  );
}
