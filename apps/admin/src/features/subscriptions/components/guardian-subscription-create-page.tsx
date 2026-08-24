"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createAdminSubscription } from "@/features/subscriptions/api/admin-subscriptions-api";
import { listAdminSubscriptionPlans } from "@/features/subscriptions/api/admin-subscription-plans-api";
import {
  formatMoneyCents,
  getErrorMessage,
  intervalLabel,
} from "@/features/subscriptions/lib/format";
import type {
  PlanProductBinding,
  SubscriptionPlan,
} from "@/features/subscriptions/types";
import { listAdminUsers } from "@/features/users/api/users-api";
import type { AdminUser } from "@/features/users/types";

function userDisplayName(user: AdminUser): string {
  return (
    user.displayName ||
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    user.email
  );
}

export function GuardianSubscriptionCreatePage() {
  const router = useRouter();

  const [patientQuery, setPatientQuery] = useState("");
  const [patientResults, setPatientResults] = useState<AdminUser[]>([]);
  const [patientSearchLoading, setPatientSearchLoading] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<AdminUser | null>(
    null,
  );

  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [planId, setPlanId] = useState("");
  const selectedPlan = plans.find((plan) => plan.id === planId) ?? null;

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [shippingNotes, setShippingNotes] = useState("");
  const [initialOrderId, setInitialOrderId] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [providerCustomerRef, setProviderCustomerRef] = useState("");
  const [providerSubscriptionRef, setProviderSubscriptionRef] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void listAdminSubscriptionPlans({ status: "PUBLISHED", take: 100 })
      .then((result) => setPlans(result.items))
      .catch((err) =>
        setError(getErrorMessage(err, "Unable to load published plans.")),
      );
  }, []);

  async function searchPatients() {
    setPatientSearchLoading(true);
    setError(null);
    try {
      const result = await listAdminUsers({
        q: patientQuery.trim() || undefined,
        kind: "patient",
        take: 10,
      });
      setPatientResults(result.items);
    } catch (err) {
      setError(getErrorMessage(err, "Unable to search patients."));
    } finally {
      setPatientSearchLoading(false);
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedPatient || !planId) {
      setError("Patient and published plan are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await createAdminSubscription({
        patientUserId: selectedPatient.id,
        planId,
        customer: {
          firstName: firstName.trim() || null,
          lastName: lastName.trim() || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
        },
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        shippingPreferenceNotes: shippingNotes.trim() || null,
        initialOrderId: initialOrderId.trim() || null,
        opaquePayment: {
          paymentMethodId: paymentMethodId.trim() || null,
          providerCustomerRef: providerCustomerRef.trim() || null,
          providerSubscriptionRef: providerSubscriptionRef.trim() || null,
        },
      });
      router.push(`/guardian/subscriptions/${created.id}`);
    } catch (err) {
      setError(getErrorMessage(err, "Unable to create subscription."));
    } finally {
      setSaving(false);
    }
  }

  const bindings: PlanProductBinding[] = Array.isArray(
    selectedPlan?.productBindings,
  )
    ? (selectedPlan.productBindings as PlanProductBinding[])
    : [];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-8 md:px-6">
      <div>
        <Link
          href="/guardian/subscriptions"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← All subscriptions
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Create subscription
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Binds a published plan and snapshots catalog lines. Status starts as
          pending setup. Payments and inventory are not executed here.
        </p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <form className="space-y-6" onSubmit={onSubmit}>
        <section className="space-y-3 rounded-md border border-border p-4">
          <h2 className="text-sm font-semibold">Patient</h2>
          <div className="flex gap-2">
            <Input
              value={patientQuery}
              onChange={(event) => setPatientQuery(event.target.value)}
              placeholder="Search patients"
            />
            <Button
              type="button"
              variant="outline"
              disabled={patientSearchLoading}
              onClick={() => void searchPatients()}
            >
              {patientSearchLoading ? "Searching…" : "Search"}
            </Button>
          </div>
          {selectedPatient ? (
            <p className="text-sm">
              Selected: {userDisplayName(selectedPatient)} ({selectedPatient.email})
            </p>
          ) : null}
          {patientResults.length > 0 ? (
            <ul className="space-y-1 text-sm">
              {patientResults.map((user) => (
                <li key={user.id}>
                  <button
                    type="button"
                    className="text-primary underline-offset-4 hover:underline"
                    onClick={() => {
                      setSelectedPatient(user);
                      setPatientResults([]);
                      setFirstName(user.firstName ?? "");
                      setLastName(user.lastName ?? "");
                      setEmail(user.email ?? "");
                      setPhone(user.phone ?? "");
                    }}
                  >
                    {userDisplayName(user)} · {user.email}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="space-y-3 rounded-md border border-border p-4">
          <h2 className="text-sm font-semibold">Published plan</h2>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            value={planId}
            onChange={(event) => setPlanId(event.target.value)}
            required
          >
            <option value="">Select a published plan</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} · {formatMoneyCents(plan.priceCents, plan.currency)}
              </option>
            ))}
          </select>
          {selectedPlan ? (
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                Interval:{" "}
                {intervalLabel(
                  selectedPlan.billingInterval,
                  selectedPlan.intervalCount,
                )}
              </div>
              <div>
                Price:{" "}
                {formatMoneyCents(selectedPlan.priceCents, selectedPlan.currency)}
              </div>
              <div className="sm:col-span-2">
                Bindings:{" "}
                {bindings.length === 0
                  ? "none"
                  : bindings
                      .map(
                        (binding) =>
                          `${binding.variantId.slice(0, 8)} × ${binding.quantity}`,
                      )
                      .join(", ")}
              </div>
            </div>
          ) : null}
        </section>

        <section className="space-y-3 rounded-md border border-border p-4">
          <h2 className="text-sm font-semibold">Customer snapshot overrides</h2>
          <p className="text-xs text-muted-foreground">
            Optional. Defaults from the selected patient at bind time.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="firstName">First name</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="lastName">Last name</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </div>
          </div>
        </section>

        <section className="space-y-3 rounded-md border border-border p-4">
          <h2 className="text-sm font-semibold">Optional fields</h2>
          <div className="space-y-1">
            <Label htmlFor="endsAt">Ends at</Label>
            <Input
              id="endsAt"
              type="datetime-local"
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="shippingNotes">Shipping preference notes</Label>
            <textarea
              id="shippingNotes"
              className="min-h-20 w-full rounded-md border border-input bg-background p-2 text-sm"
              value={shippingNotes}
              onChange={(event) => setShippingNotes(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="initialOrderId">Initial order ID</Label>
            <Input
              id="initialOrderId"
              value={initialOrderId}
              onChange={(event) => setInitialOrderId(event.target.value)}
              placeholder="Optional UUID"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="paymentMethodId">Payment method ref</Label>
              <Input
                id="paymentMethodId"
                value={paymentMethodId}
                onChange={(event) => setPaymentMethodId(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="providerCustomerRef">Provider customer ref</Label>
              <Input
                id="providerCustomerRef"
                value={providerCustomerRef}
                onChange={(event) => setProviderCustomerRef(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="providerSubscriptionRef">
                Provider subscription ref
              </Label>
              <Input
                id="providerSubscriptionRef"
                value={providerSubscriptionRef}
                onChange={(event) =>
                  setProviderSubscriptionRef(event.target.value)
                }
              />
            </div>
          </div>
        </section>

        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Creating…" : "Create"}
          </Button>
          <Button
            type="button"
            variant="outline"
            render={<Link href="/guardian/subscriptions" />}
          >
            Cancel
          </Button>
        </div>
      </form>
    </main>
  );
}
