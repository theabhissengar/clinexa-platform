"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RequirePermission } from "@/components/auth/require-permission";
import { Permissions } from "@/features/auth/permissions";
import {
  archiveUser,
  deactivateUser,
  deleteUser,
  getAdminUser,
  getUserActivity,
  getUserHistory,
  listRoles,
  reactivateUser,
  replaceUserRoles,
  requestUserPasswordReset,
  restoreUser,
  setUserPassword,
  suspendUser,
  updateAdminUser,
} from "@/features/users/api/users-api";
import type {
  AddressSnapshot,
  AdminUser,
  Role,
  UserActivityEntry,
  UserGender,
  UserHistoryEntry,
} from "@/features/users/types";

export type UserTab =
  | "general"
  | "roles"
  | "patient"
  | "addresses"
  | "security"
  | "preferences"
  | "notes"
  | "history"
  | "activity"
  | "future";

const TABS: Array<{ id: UserTab; label: string }> = [
  { id: "general", label: "General" },
  { id: "roles", label: "Roles" },
  { id: "patient", label: "Patient info" },
  { id: "addresses", label: "Addresses" },
  { id: "security", label: "Security" },
  { id: "preferences", label: "Preferences" },
  { id: "notes", label: "Notes" },
  { id: "history", label: "History" },
  { id: "activity", label: "Activity" },
  { id: "future", label: "More" },
];

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
  value: AddressSnapshot | Record<string, unknown> | null | undefined,
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

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function userName(user: AdminUser): string {
  return (
    user.displayName ||
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    user.email
  );
}

type Props = {
  userId: string;
  initialTab?: UserTab;
};

export function UserEditorPage({ userId, initialTab }: Props) {
  const router = useRouter();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [tab, setTab] = useState<UserTab>(initialTab ?? "general");
  const [roles, setRoles] = useState<Role[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");
  const [staffTitle, setStaffTitle] = useState("");
  const [staffCredentials, setStaffCredentials] = useState("");
  const [avatarMediaAssetId, setAvatarMediaAssetId] = useState("");

  const [gender, setGender] = useState<UserGender>("UNSPECIFIED");
  const [region, setRegion] = useState("");
  const [healthCardMediaAssetId, setHealthCardMediaAssetId] = useState("");
  const [stripeCustomerIdLive, setStripeCustomerIdLive] = useState("");
  const [stripeCustomerIdTest, setStripeCustomerIdTest] = useState("");
  const [internalNotes, setInternalNotes] = useState("");

  const [billingAddress, setBillingAddress] = useState<Address>(EMPTY_ADDRESS);
  const [shippingAddress, setShippingAddress] =
    useState<Address>(EMPTY_ADDRESS);

  const [preferencesText, setPreferencesText] = useState("{}");

  const [selectedRoleCodes, setSelectedRoleCodes] = useState<string[]>([]);
  const [rolesSaving, setRolesSaving] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  const [historyRows, setHistoryRows] = useState<UserHistoryEntry[]>([]);
  const [activityRows, setActivityRows] = useState<UserActivityEntry[]>([]);

  const hydrate = useCallback((next: AdminUser) => {
    setUser(next);
    setFirstName(next.firstName ?? "");
    setLastName(next.lastName ?? "");
    setDisplayName(next.displayName ?? "");
    setPhone(next.phone ?? "");
    setBio(next.bio ?? "");
    setStaffTitle(next.staffProfile?.title ?? "");
    setStaffCredentials(next.staffProfile?.credentialsDisplay ?? "");
    setAvatarMediaAssetId(next.avatarMediaAssetId ?? "");
    setGender(next.gender);
    setRegion(next.region ?? "");
    setHealthCardMediaAssetId(next.healthCardMediaAssetId ?? "");
    setStripeCustomerIdLive(next.stripeCustomerIdLive ?? "");
    setStripeCustomerIdTest(next.stripeCustomerIdTest ?? "");
    setBillingAddress(addressFromJson(next.billingAddress));
    setShippingAddress(addressFromJson(next.shippingAddress));
    setPreferencesText(JSON.stringify(next.preferences ?? {}, null, 2));
    setInternalNotes(next.internalNotes ?? "");
    setSelectedRoleCodes(next.roles.map((r) => r.code));
  }, []);

  useEffect(() => {
    void getAdminUser(userId)
      .then(hydrate)
      .catch(() => setError("Unable to load user."));
    void listRoles()
      .then(setRoles)
      .catch(() => undefined);
  }, [userId, hydrate]);

  useEffect(() => {
    if (tab !== "history" || historyRows.length) return;
    void getUserHistory(userId)
      .then(setHistoryRows)
      .catch(() => undefined);
  }, [tab, userId, historyRows.length]);

  useEffect(() => {
    if (tab !== "activity" || activityRows.length) return;
    void getUserActivity(userId)
      .then(setActivityRows)
      .catch(() => undefined);
  }, [tab, userId, activityRows.length]);

  async function onSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    let preferences: Record<string, unknown> | null = null;
    try {
      preferences = preferencesText.trim()
        ? JSON.parse(preferencesText)
        : null;
    } catch {
      setError("Preferences must be valid JSON.");
      setSaving(false);
      return;
    }
    try {
      const updated = await updateAdminUser(userId, {
        firstName: firstName || null,
        lastName: lastName || null,
        displayName: displayName || null,
        phone: phone || null,
        bio: bio || null,
        avatarMediaAssetId: avatarMediaAssetId || null,
        gender,
        region: region || null,
        healthCardMediaAssetId: healthCardMediaAssetId || null,
        billingAddress: addressToJson(billingAddress),
        shippingAddress: addressToJson(shippingAddress),
        stripeCustomerIdLive: stripeCustomerIdLive || null,
        stripeCustomerIdTest: stripeCustomerIdTest || null,
        preferences,
        internalNotes: internalNotes || null,
        staffProfile: {
          title: staffTitle || undefined,
          credentialsDisplay: staffCredentials || undefined,
        },
      });
      hydrate(updated);
      setMessage("User updated.");
    } catch {
      setError("Unable to save user.");
    } finally {
      setSaving(false);
    }
  }

  async function onSaveRoles() {
    setRolesSaving(true);
    setError(null);
    try {
      const updated = await replaceUserRoles(userId, selectedRoleCodes);
      hydrate(updated);
      setMessage("Roles updated.");
    } catch {
      setError("Unable to update roles.");
    } finally {
      setRolesSaving(false);
    }
  }

  async function onSetPassword() {
    setPasswordSaving(true);
    setError(null);
    try {
      await setUserPassword(userId, newPassword);
      setNewPassword("");
      setMessage("Password set.");
    } catch {
      setError("Unable to set password. Minimum length is 12 characters.");
    } finally {
      setPasswordSaving(false);
    }
  }

  async function runTransition(
    action: (id: string) => Promise<AdminUser>,
    label: string,
  ) {
    setError(null);
    try {
      const updated = await action(userId);
      hydrate(updated);
      setMessage(label);
    } catch {
      setError(`Unable to ${label.toLowerCase()}.`);
    }
  }

  if (!user) {
    return (
      <main className="px-6 py-10 text-sm text-muted-foreground">
        {error ?? "Loading user…"}
      </main>
    );
  }

  const isArchived = user.status === "ARCHIVED";
  const isDeleted = user.status === "DELETED";
  const canRestore = isArchived || isDeleted;

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/guardian/users"
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
        <div className="flex flex-wrap gap-2 text-sm">
          <Link
            href={`/guardian/users/${userId}/history`}
            className="text-primary hover:underline"
          >
            History
          </Link>
          <span className="text-muted-foreground">·</span>
          <Link
            href={`/guardian/users/${userId}/activity`}
            className="text-primary hover:underline"
          >
            Activity
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <form
          onSubmit={onSave}
          className="overflow-hidden rounded-md border border-border bg-card"
        >
          <div className="grid md:grid-cols-[160px_1fr]">
            <nav className="border-b border-border md:border-b-0 md:border-r">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`block w-full border-l-2 px-3 py-2.5 text-left text-sm ${
                    tab === t.id
                      ? "border-l-primary bg-muted/40 font-medium"
                      : "border-l-transparent text-muted-foreground hover:bg-muted/20"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </nav>

            <div className="space-y-4 p-4 text-sm">
              {tab === "general" ? (
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
                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor="bio">Bio</Label>
                    <textarea
                      id="bio"
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      rows={3}
                      className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="staffTitle">Staff title</Label>
                    <Input
                      id="staffTitle"
                      value={staffTitle}
                      onChange={(e) => setStaffTitle(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="staffCredentials">
                      Credentials display
                    </Label>
                    <Input
                      id="staffCredentials"
                      value={staffCredentials}
                      onChange={(e) => setStaffCredentials(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor="avatar">Avatar media asset id</Label>
                    <Input
                      id="avatar"
                      value={avatarMediaAssetId}
                      onChange={(e) => setAvatarMediaAssetId(e.target.value)}
                    />
                  </div>
                </div>
              ) : null}

              {tab === "roles" ? (
                <div className="space-y-3">
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {roles.map((role) => (
                      <label
                        key={role.code}
                        className="flex items-center gap-2"
                      >
                        <input
                          type="checkbox"
                          checked={selectedRoleCodes.includes(role.code)}
                          onChange={() =>
                            setSelectedRoleCodes((prev) =>
                              prev.includes(role.code)
                                ? prev.filter((c) => c !== role.code)
                                : [...prev, role.code],
                            )
                          }
                        />
                        {role.name}
                      </label>
                    ))}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={rolesSaving}
                    onClick={() => void onSaveRoles()}
                  >
                    {rolesSaving ? "Saving…" : "Save roles"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Replacing roles revokes all active sessions for this user.
                  </p>
                </div>
              ) : null}

              {tab === "patient" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="gender">Gender</Label>
                    <select
                      id="gender"
                      className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                      value={gender}
                      onChange={(e) =>
                        setGender(e.target.value as UserGender)
                      }
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
                  <div className="space-y-1">
                    <Label>Date of birth</Label>
                    <Input value={user.dateOfBirth ?? "—"} disabled />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="healthCard">
                      Health card media asset id
                    </Label>
                    <Input
                      id="healthCard"
                      value={healthCardMediaAssetId}
                      onChange={(e) =>
                        setHealthCardMediaAssetId(e.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="stripeLive">
                      Stripe customer id (live)
                    </Label>
                    <Input
                      id="stripeLive"
                      value={stripeCustomerIdLive}
                      onChange={(e) =>
                        setStripeCustomerIdLive(e.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="stripeTest">
                      Stripe customer id (test)
                    </Label>
                    <Input
                      id="stripeTest"
                      value={stripeCustomerIdTest}
                      onChange={(e) =>
                        setStripeCustomerIdTest(e.target.value)
                      }
                    />
                  </div>
                </div>
              ) : null}

              {tab === "addresses" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <div className="font-medium">Billing address</div>
                    {(
                      Object.keys(EMPTY_ADDRESS) as Array<keyof Address>
                    ).map((field) => (
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
                    ))}
                  </div>
                  <div className="space-y-2">
                    <div className="font-medium">Shipping address</div>
                    {(
                      Object.keys(EMPTY_ADDRESS) as Array<keyof Address>
                    ).map((field) => (
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
                    ))}
                  </div>
                </div>
              ) : null}

              {tab === "security" ? (
                <div className="space-y-4">
                  <div>
                    <div className="font-medium">Two-factor authentication</div>
                    <p className="text-muted-foreground capitalize">
                      {user.securitySummary.twoFactorStatus}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <div className="font-medium">Failed login count</div>
                    <p className="text-muted-foreground">
                      {user.securitySummary.failedLoginCount}
                    </p>
                  </div>
                  {user.securitySummary.lockedUntil ? (
                    <div className="space-y-1">
                      <div className="font-medium">Locked until</div>
                      <p className="text-muted-foreground">
                        {formatDate(user.securitySummary.lockedUntil)}
                      </p>
                    </div>
                  ) : null}
                  <div className="space-y-1 border-t border-border pt-3">
                    <div className="font-medium">Password reset</div>
                    <p className="text-muted-foreground">
                      Send a password reset email to the user.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void requestUserPasswordReset(userId)
                          .then(() => setMessage("Password reset email sent."))
                          .catch(() =>
                            setError("Unable to send password reset."),
                          )
                      }
                    >
                      Send reset email
                    </Button>
                  </div>
                  <div className="space-y-1 border-t border-border pt-3">
                    <div className="font-medium">Set password</div>
                    <div className="flex gap-2">
                      <Input
                        type="password"
                        placeholder="New password (12+ chars)"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={passwordSaving || newPassword.length < 12}
                        onClick={() => void onSetPassword()}
                      >
                        {passwordSaving ? "Saving…" : "Set password"}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}

              {tab === "preferences" ? (
                <div className="space-y-1">
                  <Label htmlFor="preferences">Preferences (JSON)</Label>
                  <textarea
                    id="preferences"
                    value={preferencesText}
                    onChange={(e) => setPreferencesText(e.target.value)}
                    rows={10}
                    className="w-full rounded-md border border-border bg-transparent px-3 py-2 font-mono text-xs"
                  />
                </div>
              ) : null}

              {tab === "notes" ? (
                <div className="space-y-1">
                  <Label htmlFor="internalNotes">Internal notes</Label>
                  <textarea
                    id="internalNotes"
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    rows={8}
                    className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Class D field — visible to staff with appropriate access.
                    CRM users can edit the same field from the operational
                    detail page.
                  </p>
                </div>
              ) : null}

              {tab === "history" ? (
                <ul className="space-y-2">
                  {historyRows.map((row) => (
                    <li
                      key={row.id}
                      className="rounded border border-border px-3 py-2"
                    >
                      <div className="font-medium">{row.action}</div>
                      <div className="text-muted-foreground">
                        {formatDate(row.createdAt)}
                      </div>
                    </li>
                  ))}
                  {!historyRows.length ? (
                    <li className="text-muted-foreground">No history yet.</li>
                  ) : null}
                </ul>
              ) : null}

              {tab === "activity" ? (
                <ul className="space-y-2">
                  {activityRows.map((row) => (
                    <li
                      key={row.id}
                      className="rounded border border-border px-3 py-2"
                    >
                      <div className="font-medium">{row.summary}</div>
                      <div className="text-muted-foreground">
                        {row.kind} · {formatDate(row.createdAt)}
                      </div>
                    </li>
                  ))}
                  {!activityRows.length ? (
                    <li className="text-muted-foreground">No activity yet.</li>
                  ) : null}
                </ul>
              ) : null}

              {tab === "future" ? (
                <p className="text-muted-foreground">
                  More user management features are coming soon.
                </p>
              ) : null}
            </div>
          </div>

          <div className="border-t border-border p-3">
            {error ? (
              <p className="mb-2 text-xs text-destructive">{error}</p>
            ) : null}
            {message ? (
              <p className="mb-2 text-xs text-emerald-600">{message}</p>
            ) : null}
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Update User"}
            </Button>
          </div>
        </form>

        <aside className="flex flex-col gap-4">
          <div className="rounded-md border border-border bg-card">
            <div className="border-b border-border px-3 py-2 text-sm font-medium">
              Status
            </div>
            <div className="space-y-2 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Current</span>
                <span className="capitalize">
                  {user.status.replace(/_/g, " ").toLowerCase()}
                </span>
              </div>
              <div className="flex flex-col gap-1 pt-1">
                {user.status !== "ACTIVE" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void runTransition(reactivateUser, "Reactivated")
                    }
                  >
                    Reactivate
                  </Button>
                ) : null}
                {user.status === "ACTIVE" ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void runTransition(suspendUser, "Suspended")
                      }
                    >
                      Suspend
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void runTransition(deactivateUser, "Deactivated")
                      }
                    >
                      Deactivate
                    </Button>
                  </>
                ) : null}
                {canRestore ? (
                  <RequirePermission permission={Permissions.ADM_RESTORE_USER}>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void runTransition(restoreUser, "Restored")
                      }
                    >
                      Restore
                    </Button>
                  </RequirePermission>
                ) : (
                  <RequirePermission permission={Permissions.ADM_ARCHIVE_USER}>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void runTransition(archiveUser, "Archived")
                      }
                    >
                      Archive
                    </Button>
                  </RequirePermission>
                )}
                {!isDeleted ? (
                  <RequirePermission permission={Permissions.ADM_DELETE_USER}>
                    <button
                      type="button"
                      className="pt-1 text-left text-sm text-destructive hover:underline"
                      onClick={() =>
                        void deleteUser(userId)
                          .then(() => router.push("/guardian/users"))
                          .catch(() =>
                            setError(
                              "Delete failed. Last-admin safeguard may apply.",
                            ),
                          )
                      }
                    >
                      Delete permanently
                    </button>
                  </RequirePermission>
                ) : null}
              </div>
            </div>
          </div>

          <div className="rounded-md border border-border bg-card">
            <div className="border-b border-border px-3 py-2 text-sm font-medium">
              Roles
            </div>
            <div className="space-y-1 p-3 text-sm text-muted-foreground">
              {user.roles.length
                ? user.roles.map((r) => r.name).join(", ")
                : "No roles assigned."}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
