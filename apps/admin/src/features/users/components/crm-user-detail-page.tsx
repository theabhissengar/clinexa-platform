"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCrmUser, updateCrmUser } from "@/features/users/api/users-api";
import type { AddressSnapshot, OperationalUser, UserGender } from "@/features/users/types";

const GENDERS: UserGender[] = ["UNSPECIFIED", "MALE", "FEMALE", "OTHER"];

type Address = {
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
};

const EMPTY_ADDRESS: Address = {
  line1: "",
  line2: "",
  city: "",
  region: "",
  postalCode: "",
  country: "",
};

function addressFromJson(
  value: Record<string, unknown> | AddressSnapshot | null | undefined,
): Address {
  if (!value) return { ...EMPTY_ADDRESS };
  const record = value as Record<string, unknown>;
  return {
    line1: String(record.line1 ?? ""),
    line2: String(record.line2 ?? ""),
    city: String(record.city ?? ""),
    region: String(record.region ?? ""),
    postalCode: String(record.postalCode ?? ""),
    country: String(record.country ?? ""),
  };
}

function addressToJson(address: Address): AddressSnapshot | null {
  const entries = Object.entries(address).filter(([, v]) => v.trim() !== "");
  if (!entries.length) return null;
  return Object.fromEntries(entries) as AddressSnapshot;
}

function userName(user: OperationalUser): string {
  return (
    user.displayName ||
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    user.email
  );
}

export function CrmUserDetailPage() {
  const params = useParams<{ id: string }>();
  const userId = params.id;

  const [user, setUser] = useState<OperationalUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState<UserGender>("UNSPECIFIED");
  const [region, setRegion] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [billingAddress, setBillingAddress] = useState<Address>(EMPTY_ADDRESS);
  const [shippingAddress, setShippingAddress] =
    useState<Address>(EMPTY_ADDRESS);

  const hydrate = useCallback((next: OperationalUser) => {
    setUser(next);
    setFirstName(next.firstName ?? "");
    setLastName(next.lastName ?? "");
    setDisplayName(next.displayName ?? "");
    setPhone(next.phone ?? "");
    setGender(next.gender);
    setRegion(next.region ?? "");
    setInternalNotes(next.internalNotes ?? "");
    setBillingAddress(addressFromJson(next.billingAddress));
    setShippingAddress(addressFromJson(next.shippingAddress));
  }, []);

  useEffect(() => {
    void getCrmUser(userId)
      .then(hydrate)
      .catch(() => setError("Unable to load user."));
  }, [userId, hydrate]);

  async function onSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await updateCrmUser(userId, {
        firstName: firstName || null,
        lastName: lastName || null,
        displayName: displayName || null,
        phone: phone || null,
        gender,
        region: region || null,
        internalNotes: internalNotes || null,
        billingAddress: addressToJson(billingAddress),
        shippingAddress: addressToJson(shippingAddress),
      });
      hydrate(updated);
      setMessage("User updated.");
    } catch {
      setError("Unable to save user.");
    } finally {
      setSaving(false);
    }
  }

  if (!user) {
    return (
      <main className="px-6 py-10 text-sm text-muted-foreground">
        {error ?? "Loading user…"}
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/crm/users"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            ← All users
          </Link>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">
            {userName(user)}
          </h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {user.email} · ID: {user.id}
          </p>
        </div>
        <Link
          href={`/guardian/users/${userId}/edit`}
          className="text-sm text-primary hover:underline"
        >
          Manage in Guardian →
        </Link>
      </div>

      <form
        onSubmit={onSave}
        className="flex flex-col gap-4 rounded-md border border-border bg-card p-4"
      >
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {message ? (
          <p className="text-sm text-emerald-600">{message}</p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="firstName">First name</Label>
            <Input
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="lastName">Last name</Label>
            <Input
              id="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="displayName">Display name</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="gender">Gender</Label>
            <select
              id="gender"
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
              value={gender}
              onChange={(e) => setGender(e.target.value as UserGender)}
            >
              {GENDERS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="region">Region</Label>
            <Input
              id="region"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <div className="text-sm font-medium">Billing address</div>
            {(Object.keys(EMPTY_ADDRESS) as Array<keyof Address>).map(
              (field) => (
                <Input
                  key={field}
                  placeholder={field}
                  value={billingAddress[field]}
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
          <div className="space-y-2">
            <div className="text-sm font-medium">Shipping address</div>
            {(Object.keys(EMPTY_ADDRESS) as Array<keyof Address>).map(
              (field) => (
                <Input
                  key={field}
                  placeholder={field}
                  value={shippingAddress[field]}
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
        </div>

        <div className="space-y-1">
          <Label htmlFor="internalNotes">Internal notes</Label>
          <textarea
            id="internalNotes"
            value={internalNotes}
            onChange={(e) => setInternalNotes(e.target.value)}
            rows={4}
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
          />
        </div>

        <div>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Update"}
          </Button>
        </div>
      </form>
    </main>
  );
}
