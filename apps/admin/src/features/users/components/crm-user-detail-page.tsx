"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ClipboardList, FileText, Stethoscope } from "lucide-react";

import {
  ClinexaPage,
  DetailSection,
  EntityDetailHeader,
  EntityDetailLeading,
  ErrorState,
  FieldGrid,
  PageBody,
  PageHeaderActions,
  PageSkeleton,
} from "@/components/patterns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { listCrmOrders } from "@/features/orders/api/orders-api";
import {
  addCrmPaymentMethod,
  deleteCrmPaymentMethod,
  listCrmPaymentMethods,
  makeCrmPaymentMethodDefault,
} from "@/features/payments/api/crm-payments-api";
import { MedicalProfileEditor } from "@/features/shared/components/medical-profile-editor";
import {
  ModuleDetailSearch,
  type ModuleSearchResult,
} from "@/features/shared/components/module-detail-search";
import { NotesTimeline } from "@/features/shared/components/notes-timeline";
import { listCrmSubscriptions } from "@/features/subscriptions/api/subscriptions-api";
import {
  addCrmUserNote,
  getCrmUser,
  listCrmUserNotes,
  listCrmUsers,
  updateCrmUser,
} from "@/features/users/api/users-api";
import type {
  AddressSnapshot,
  MedicalProfile,
  OperationalUser,
  SavedPaymentMethod,
  UserGender,
  UserNote,
} from "@/features/users/types";

const GENDERS: UserGender[] = ["UNSPECIFIED", "MALE", "FEMALE", "OTHER"];

type SectionId =
  | "profile"
  | "medical"
  | "orders"
  | "subscriptions"
  | "prescriptions"
  | "questionnaires"
  | "addresses"
  | "payments"
  | "documents"
  | "notes";

const SECTIONS: Array<{ id: SectionId; label: string }> = [
  { id: "profile", label: "Profile" },
  { id: "medical", label: "Medical Profile" },
  { id: "orders", label: "Orders" },
  { id: "subscriptions", label: "Subscriptions" },
  { id: "prescriptions", label: "Prescriptions" },
  { id: "questionnaires", label: "Questionnaires" },
  { id: "addresses", label: "Billing & Shipping" },
  { id: "payments", label: "Payment Profiles" },
  { id: "documents", label: "Documents" },
  { id: "notes", label: "Notes" },
];

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
  const router = useRouter();
  const userId = params.id;
  const [user, setUser] = useState<OperationalUser | null>(null);
  const [notes, setNotes] = useState<UserNote[]>([]);
  const [orders, setOrders] = useState<
    Array<{ id: string; orderNumber: string; status: string }>
  >([]);
  const [subscriptions, setSubscriptions] = useState<
    Array<{ id: string; subscriptionNumber: string | null; status: string }>
  >([]);
  const [paymentMethods, setPaymentMethods] = useState<SavedPaymentMethod[]>(
    [],
  );
  const [saving, setSaving] = useState(false);
  const [addingNote, setAddingNote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState<UserGender>("UNSPECIFIED");
  const [region, setRegion] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [medicalProfile, setMedicalProfile] = useState<MedicalProfile | null>(
    null,
  );
  const [billingAddress, setBillingAddress] = useState<Address>(EMPTY_ADDRESS);
  const [shippingAddress, setShippingAddress] =
    useState<Address>(EMPTY_ADDRESS);

  const [newCardBrand, setNewCardBrand] = useState("Visa");
  const [newCardLast4, setNewCardLast4] = useState("4242");

  const hydrate = useCallback((next: OperationalUser) => {
    setUser(next);
    setFirstName(next.firstName ?? "");
    setLastName(next.lastName ?? "");
    setDisplayName(next.displayName ?? "");
    setPhone(next.phone ?? "");
    setGender(next.gender);
    setRegion(next.region ?? "");
    setInternalNotes(next.internalNotes ?? "");
    setMedicalProfile(next.medicalProfile);
    setBillingAddress(addressFromJson(next.billingAddress));
    setShippingAddress(addressFromJson(next.shippingAddress));
  }, []);

  useEffect(() => {
    void getCrmUser(userId)
      .then(hydrate)
      .catch(() => setError("Unable to load user."));
    void listCrmUserNotes(userId).then(setNotes).catch(() => setNotes([]));
    void listCrmOrders({ patientUserId: userId, take: 20 })
      .then((result) => setOrders(result.items))
      .catch(() => setOrders([]));
    void listCrmSubscriptions({ patientUserId: userId, take: 20 })
      .then((result) => setSubscriptions(result.items))
      .catch(() => setSubscriptions([]));
    void listCrmPaymentMethods(userId)
      .then(setPaymentMethods)
      .catch(() => setPaymentMethods([]));
  }, [userId, hydrate]);

  const searchUsers = useCallback(async (q: string): Promise<ModuleSearchResult[]> => {
    const result = await listCrmUsers({ q, take: 10 });
    return result.items.map((row) => ({
      id: row.id,
      label: userName(row),
      sublabel: row.email,
    }));
  }, []);

  async function onSaveProfile(event: React.FormEvent) {
    event.preventDefault();
    if (!user) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await updateCrmUser(user.id, {
        firstName: firstName || null,
        lastName: lastName || null,
        displayName: displayName || null,
        phone: phone || null,
        gender,
        region: region || null,
        medicalProfile,
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

  async function onAddNote(body: string, visibility: "PRIVATE" | "USER_VISIBLE") {
    if (!user) return;
    setAddingNote(true);
    try {
      await addCrmUserNote(user.id, body, visibility);
      const refreshed = await listCrmUserNotes(user.id);
      setNotes(refreshed);
      setMessage("Note added.");
    } catch {
      setError("Unable to add note.");
    } finally {
      setAddingNote(false);
    }
  }

  async function onAddPaymentMethod() {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      await addCrmPaymentMethod(user.id, {
        brand: newCardBrand,
        last4: newCardLast4,
        isDefault: paymentMethods.length === 0,
      });
      const methods = await listCrmPaymentMethods(user.id);
      setPaymentMethods(methods);
      setMessage("Payment method added.");
    } catch {
      setError("Unable to add payment method.");
    } finally {
      setSaving(false);
    }
  }

  if (!user) {
    if (error) {
      return (
        <ClinexaPage width="wide">
          <ErrorState title="Unable to load user">{error}</ErrorState>
        </ClinexaPage>
      );
    }
    return (
      <ClinexaPage width="wide">
        <PageSkeleton />
      </ClinexaPage>
    );
  }

  return (
    <ClinexaPage width="wide" className="gap-6">
      <EntityDetailHeader
        leading={
          <EntityDetailLeading>
            <Link
              href="/crm/users"
              className="underline-offset-4 hover:underline"
            >
              ← All users
            </Link>
          </EntityDetailLeading>
        }
        title={userName(user)}
        identifier={`${user.email} · ID: ${user.id}`}
        status={<StatusBadge status={user.status} />}
        actions={
          <PageHeaderActions>
            <Button
              size="sm"
              variant="outline"
              render={
                <Link
                  href={`/guardian/users/${user.id}/edit`}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              Manage in Guardian
            </Button>
          </PageHeaderActions>
        }
      />

      <ModuleDetailSearch
        placeholder="Search users…"
        searchFn={searchUsers}
        onSelect={(id) => router.push(`/crm/users/${id}`)}
      />

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="text-sm text-success" role="status">
          {message}
        </p>
      ) : null}

      <PageBody>
        <div className="flex flex-col gap-6 lg:flex-row">
          <nav className="flex flex-row flex-wrap gap-2 lg:w-48 lg:flex-col lg:gap-1">
            {SECTIONS.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {section.label}
              </a>
            ))}
          </nav>

          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <DetailSection id="profile" title="User Profile">
              <form onSubmit={onSaveProfile} className="space-y-3">
                <FieldGrid columns={2}>
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
                      className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
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
                </FieldGrid>
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Update profile"}
                </Button>
              </form>
            </DetailSection>

            <DetailSection id="medical" title="Medical Profile">
              <MedicalProfileEditor
                value={medicalProfile}
                onChange={setMedicalProfile}
                disabled={saving}
              />
              <Button
                type="button"
                className="mt-3"
                disabled={saving}
                onClick={() =>
                  void onSaveProfile({
                    preventDefault: () => {},
                  } as React.FormEvent)
                }
              >
                Save medical profile
              </Button>
            </DetailSection>

            <DetailSection id="orders" title="Orders">
              {orders.length === 0 ? (
                <p className="text-sm text-muted-foreground">No orders.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {orders.map((order) => (
                    <li
                      key={order.id}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <Link
                        href={`/crm/orders/${order.id}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {order.orderNumber}
                      </Link>
                      <StatusBadge status={order.status} />
                    </li>
                  ))}
                </ul>
              )}
            </DetailSection>

            <DetailSection id="subscriptions" title="Subscriptions">
              {subscriptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No subscriptions.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {subscriptions.map((row) => (
                    <li
                      key={row.id}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <Link
                        href={`/crm/subscriptions/${row.id}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {row.subscriptionNumber ?? row.id}
                      </Link>
                      <StatusBadge status={row.status} />
                    </li>
                  ))}
                </ul>
              )}
            </DetailSection>

            <DetailSection id="prescriptions" title="Prescriptions">
              <div className="flex items-start gap-3 text-sm text-muted-foreground">
                <Stethoscope className="mt-0.5 size-4 shrink-0" aria-hidden />
                <p>Prescription management is coming soon in a future phase.</p>
              </div>
            </DetailSection>

            <DetailSection id="questionnaires" title="Questionnaires">
              <div className="flex items-start gap-3 text-sm text-muted-foreground">
                <ClipboardList className="mt-0.5 size-4 shrink-0" aria-hidden />
                <p>
                  Questionnaire responses are coming soon in a future phase.
                </p>
              </div>
            </DetailSection>

            <DetailSection id="addresses" title="Billing & Shipping addresses">
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
              <Button
                type="button"
                className="mt-3"
                disabled={saving}
                onClick={() =>
                  void onSaveProfile({
                    preventDefault: () => {},
                  } as React.FormEvent)
                }
              >
                Save addresses
              </Button>
            </DetailSection>

            <DetailSection id="payments" title="Payment Profiles">
              {paymentMethods.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No saved payment methods.
                </p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {paymentMethods.map((method) => (
                    <li
                      key={method.id}
                      className="flex flex-wrap items-center gap-2 border-b border-border pb-2"
                    >
                      <span>
                        {method.brand ?? "Card"} ···{method.last4 ?? "????"}
                        {method.isDefault ? " · default" : ""}
                      </span>
                      {!method.isDefault ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={saving}
                          onClick={() =>
                            void makeCrmPaymentMethodDefault(user.id, method.id)
                              .then(() => listCrmPaymentMethods(user.id))
                              .then(setPaymentMethods)
                          }
                        >
                          Make default
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={saving || method.isDefault}
                        onClick={() =>
                          void deleteCrmPaymentMethod(user.id, method.id)
                            .then(() => listCrmPaymentMethods(user.id))
                            .then(setPaymentMethods)
                        }
                      >
                        Delete
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4 grid max-w-md gap-2 sm:grid-cols-2">
                <Input
                  placeholder="Brand"
                  value={newCardBrand}
                  onChange={(e) => setNewCardBrand(e.target.value)}
                />
                <Input
                  placeholder="Last 4"
                  value={newCardLast4}
                  onChange={(e) => setNewCardLast4(e.target.value)}
                  maxLength={4}
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={saving}
                  onClick={() => void onAddPaymentMethod()}
                >
                  Add simulated card
                </Button>
              </div>
            </DetailSection>

            <DetailSection id="documents" title="Documents">
              <div className="flex items-start gap-3 text-sm text-muted-foreground">
                <FileText className="mt-0.5 size-4 shrink-0" aria-hidden />
                <p>
                  Document upload and management are not available in this
                  phase. This section is a placeholder for future document
                  workflows.
                </p>
              </div>
            </DetailSection>

            <DetailSection id="notes" title="Notes">
              {internalNotes ? (
                <div className="mb-4 rounded-lg border border-dashed border-border bg-muted/30 p-3 text-sm">
                  <div className="text-xs font-medium text-muted-foreground">
                    Legacy internal notes blob
                  </div>
                  <p className="mt-2 whitespace-pre-wrap">{internalNotes}</p>
                </div>
              ) : null}
              <NotesTimeline
                notes={notes}
                activities={[]}
                onAddNote={onAddNote}
                addingNote={addingNote}
              />
            </DetailSection>
          </div>
        </div>
      </PageBody>
    </ClinexaPage>
  );
}
