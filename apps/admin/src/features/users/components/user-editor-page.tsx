"use client";

import Link from "next/link";
import { ChevronDown, ChevronUp } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  AppSelect,
  ClinexaPage,
  DetailSection,
  ErrorState,
  FieldGrid,
  PageSkeleton,
  crossAppNavButtonClassName,
  filterApplyButtonClassName,
} from "@/components/patterns";
import { RequirePermission } from "@/components/auth/require-permission";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { Permissions } from "@/features/auth/permissions";
import { NotesTimeline } from "@/features/shared/components/notes-timeline";
import {
  archiveUser,
  addAdminUserNote,
  deactivateUser,
  deleteAdminUserNote,
  deleteUser,
  getAdminUser,
  getUserActivity,
  getUserHistory,
  listAdminUserNotes,
  listRoles,
  reactivateUser,
  replaceUserRoles,
  requestUserPasswordReset,
  restoreUser,
  setUserPassword,
  suspendUser,
  updateAdminUser,
} from "@/features/users/api/users-api";
import { AddressFieldsEditor } from "@/features/users/components/address-fields-editor";
import {
  addressFromJson,
  addressToJson,
  ADDRESS_REGION_OPTIONS,
  EMPTY_USER_ADDRESS,
  type UserAddressForm,
} from "@/features/users/lib/address";
import {
  sanitizeDisplayName,
  sanitizePersonName,
  sanitizePlainText,
  validateAddressFields,
  validateUserProfileFields,
} from "@/features/users/lib/user-field-validation";
import { formatPhoneMask, toPhoneDigits } from "@/features/users/lib/phone";
import type {
  AdminUser,
  Role,
  UserActivityEntry,
  UserGender,
  UserHistoryEntry,
  UserNote,
} from "@/features/users/types";
import { cn } from "@/lib/utils";

export type UserTab =
  | "general"
  | "roles"
  | "patient"
  | "addresses"
  | "security"
  | "preferences"
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
  { id: "history", label: "History" },
  { id: "activity", label: "Activity" },
  { id: "future", label: "More" },
];

const TAB_IDS = new Set<string>(TABS.map((t) => t.id));

function parseTab(value: string | null | undefined): UserTab {
  if (value && TAB_IDS.has(value)) return value as UserTab;
  return "general";
}

const GENDERS: UserGender[] = ["UNSPECIFIED", "MALE", "FEMALE", "OTHER"];

type Address = UserAddressForm;
const EMPTY_ADDRESS = EMPTY_USER_ADDRESS;

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function Field({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function PillTabs({
  value,
  onChange,
}: {
  value: UserTab;
  onChange: (tab: UserTab) => void;
}) {
  return (
    <nav
      aria-label="User sections"
      className="max-w-full overflow-x-auto"
    >
      <div className="inline-flex w-max max-w-full gap-1 rounded-xl border border-border/80 bg-muted/30 p-1 dark:border-white/10 dark:bg-white/3">
        {TABS.map((t) => {
          const active = value === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              className={cn(
                "shrink-0 rounded-lg px-2.5 py-1.5 text-sm whitespace-nowrap transition-colors",
                active
                  ? "bg-[#efd56a] font-medium text-[#1c1c1c] shadow-sm dark:text-[#121417]"
                  : "text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/8",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function CrmNotesRail({
  notes,
  internalNotes,
  notesCollapsed,
  onToggleCollapsed,
  addingNote,
  deletingNoteId,
  onAddNote,
  onDeleteNote,
}: {
  notes: UserNote[];
  internalNotes: string;
  notesCollapsed: boolean;
  onToggleCollapsed: () => void;
  addingNote: boolean;
  deletingNoteId: string | null;
  onAddNote: (
    body: string,
    visibility: "PRIVATE" | "USER_VISIBLE",
  ) => Promise<void>;
  onDeleteNote: (noteId: string) => Promise<void>;
}) {
  return (
    <aside
      className={cn(
        "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl shadow-sm",
        notesCollapsed
          ? "border-0 bg-slate-800 dark:bg-slate-900"
          : cn(
              "h-112 border border-slate-200/90 bg-[linear-gradient(180deg,#eef4fb_0%,#e7eef8_55%,#e2ebf5_100%)] ring-1 ring-slate-900/5",
              "dark:border-slate-700 dark:bg-[linear-gradient(180deg,#1a2332_0%,#172033_100%)] dark:ring-slate-900/40",
            ),
      )}
    >
      <button
        type="button"
        className={cn(
          "flex w-full shrink-0 items-start gap-2 bg-slate-800 px-4 py-3 text-left transition-colors hover:bg-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800",
          !notesCollapsed && "border-b border-slate-700/80",
        )}
        aria-expanded={!notesCollapsed}
        onClick={onToggleCollapsed}
      >
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold tracking-tight text-white">
            Notes
          </h2>
          <p className="mt-0.5 text-xs text-slate-300">
            Shared across every section on this patient
          </p>
        </div>
        <span
          className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full text-white"
          aria-hidden
        >
          {notesCollapsed ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronUp className="size-4" />
          )}
        </span>
      </button>
      {!notesCollapsed ? (
        <div className="flex min-h-0 flex-1 flex-col p-4 pt-3">
          {internalNotes ? (
            <div className="mb-3 shrink-0 rounded-xl border border-dashed border-slate-300 bg-white/70 p-3 text-sm dark:border-slate-600 dark:bg-slate-900/50">
              <div className="text-[0.65rem] font-medium tracking-[0.06em] text-slate-500 uppercase dark:text-slate-400">
                Legacy internal notes
              </div>
              <p className="mt-2 whitespace-pre-wrap text-slate-800 dark:text-slate-100">
                {internalNotes}
              </p>
            </div>
          ) : null}
          <NotesTimeline
            notes={notes}
            activities={[]}
            onAddNote={onAddNote}
            onDeleteNote={onDeleteNote}
            addingNote={addingNote}
            deletingNoteId={deletingNoteId}
            variant="cool"
            className="min-h-0 flex-1"
          />
        </div>
      ) : null}
    </aside>
  );
}

function LifecycleRail({
  user,
  userId,
  collapsed,
  onToggleCollapsed,
  onTransition,
  onDeleted,
}: {
  user: AdminUser;
  userId: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onTransition: (
    action: (id: string) => Promise<AdminUser>,
    label: string,
  ) => void;
  onDeleted: () => void;
}) {
  const isArchived = user.status === "ARCHIVED";
  const isDeleted = user.status === "DELETED";
  const canRestore = isArchived || isDeleted;
  const actionBtn =
    "h-8 min-w-0 flex-1 px-2 text-xs justify-center sm:text-[0.8rem]";

  return (
    <aside className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm dark:border-white/10">
      <button
        type="button"
        className={cn(
          "flex w-full items-start gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/40",
          !collapsed && "border-b border-border dark:border-white/10",
        )}
        aria-expanded={!collapsed}
        onClick={onToggleCollapsed}
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold tracking-tight">
              Account status
            </h2>
            <StatusBadge status={user.status} />
          </div>
          <p className="text-xs text-muted-foreground">
            Lifecycle controls for this account
          </p>
        </div>
        <span
          className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground"
          aria-hidden
        >
          {collapsed ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronUp className="size-4" />
          )}
        </span>
      </button>
      {!collapsed ? (
        <div className="space-y-3 p-4 text-sm">
          <div className="flex flex-row flex-wrap gap-1.5">
            {user.status !== "ACTIVE" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={actionBtn}
                onClick={() =>
                  void onTransition(reactivateUser, "Reactivated")
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
                  className={actionBtn}
                  onClick={() => void onTransition(suspendUser, "Suspended")}
                >
                  Suspend
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={actionBtn}
                  onClick={() =>
                    void onTransition(deactivateUser, "Deactivated")
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
                  className={actionBtn}
                  onClick={() => void onTransition(restoreUser, "Restored")}
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
                  className={actionBtn}
                  onClick={() => void onTransition(archiveUser, "Archived")}
                >
                  Archive
                </Button>
              </RequirePermission>
            )}
          </div>
          {!isDeleted ? (
            <RequirePermission permission={Permissions.ADM_DELETE_USER}>
              <button
                type="button"
                className="rounded-md px-2 py-1.5 text-left text-sm text-destructive hover:bg-destructive/10"
                onClick={() =>
                  void deleteUser(userId)
                    .then(onDeleted)
                    .catch(() =>
                      toast.error(
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
      ) : null}
    </aside>
  );
}

type Props = {
  userId: string;
};

export function UserEditorPage({ userId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));

  const [user, setUser] = useState<AdminUser | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");
  const [staffTitle, setStaffTitle] = useState("");
  const [staffCredentials, setStaffCredentials] = useState("");

  const [gender, setGender] = useState<UserGender>("UNSPECIFIED");
  const [region, setRegion] = useState("");
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
  const [userNotes, setUserNotes] = useState<UserNote[]>([]);
  const [notesCollapsed, setNotesCollapsed] = useState(true);
  const [statusCollapsed, setStatusCollapsed] = useState(true);
  const [addingNote, setAddingNote] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);

  const hydrate = useCallback((next: AdminUser) => {
    setUser(next);
    setFirstName(next.firstName ?? "");
    setLastName(next.lastName ?? "");
    setDisplayName(next.displayName ?? "");
    setPhone(toPhoneDigits(next.phone ?? ""));
    setBio(next.bio ?? "");
    setStaffTitle(next.staffProfile?.title ?? "");
    setStaffCredentials(next.staffProfile?.credentialsDisplay ?? "");
    setGender(next.gender);
    setRegion(next.region ?? "");
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
      .catch(() => setLoadError("Unable to load user."));
    void listRoles()
      .then(setRoles)
      .catch(() => undefined);
    void listAdminUserNotes(userId)
      .then(setUserNotes)
      .catch(() => setUserNotes([]));
  }, [userId, hydrate]);

  useEffect(() => {
    const raw = searchParams.get("tab");
    if (!raw || !TAB_IDS.has(raw)) {
      router.replace(`${pathname}?tab=general`, { scroll: false });
    }
  }, [searchParams, pathname, router]);

  useEffect(() => {
    if (tab !== "history") return;
    void getUserHistory(userId)
      .then(setHistoryRows)
      .catch(() => setHistoryRows([]));
  }, [tab, userId]);

  useEffect(() => {
    if (tab !== "activity") return;
    void getUserActivity(userId)
      .then(setActivityRows)
      .catch(() => setActivityRows([]));
  }, [tab, userId]);

  function goToTab(next: UserTab) {
    if (next === tab) return;
    router.replace(`${pathname}?tab=${next}`, { scroll: false });
  }

  async function onAddNote(
    body: string,
    visibility: "PRIVATE" | "USER_VISIBLE",
  ) {
    setAddingNote(true);
    try {
      await addAdminUserNote(userId, body, visibility);
      const refreshed = await listAdminUserNotes(userId);
      setUserNotes(refreshed);
      toast.success("Note added.");
    } catch {
      toast.error("Unable to add note.");
    } finally {
      setAddingNote(false);
    }
  }

  async function onDeleteNote(noteId: string) {
    setDeletingNoteId(noteId);
    try {
      await deleteAdminUserNote(userId, noteId);
      setUserNotes((prev) => prev.filter((note) => note.id !== noteId));
      toast.success("Note deleted.");
    } catch {
      toast.error("Unable to delete note.");
    } finally {
      setDeletingNoteId(null);
    }
  }

  async function onSave(event: React.FormEvent) {
    event.preventDefault();

    const profileError = validateUserProfileFields({
      firstName,
      lastName,
      displayName,
      phone,
      bio,
      staffTitle,
      staffCredentials,
      region,
      stripeCustomerIdLive,
      stripeCustomerIdTest,
    });
    if (profileError) {
      toast.error(profileError);
      return;
    }
    const billingError = validateAddressFields("Billing address", billingAddress);
    if (billingError) {
      toast.error(billingError);
      return;
    }
    const shippingError = validateAddressFields(
      "Shipping address",
      shippingAddress,
    );
    if (shippingError) {
      toast.error(shippingError);
      return;
    }

    setSaving(true);
    let preferences: Record<string, unknown> | null = null;
    try {
      preferences = preferencesText.trim()
        ? JSON.parse(preferencesText)
        : null;
    } catch {
      toast.error("Preferences must be valid JSON.");
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
        gender,
        region: region || null,
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
      toast.success("User updated.");
    } catch {
      toast.error("Unable to save user.");
    } finally {
      setSaving(false);
    }
  }

  async function onSaveRoles() {
    setRolesSaving(true);
    try {
      const updated = await replaceUserRoles(userId, selectedRoleCodes);
      hydrate(updated);
      toast.success("Roles updated.");
    } catch {
      toast.error("Unable to update roles.");
    } finally {
      setRolesSaving(false);
    }
  }

  async function onSetPassword() {
    setPasswordSaving(true);
    try {
      await setUserPassword(userId, newPassword);
      setNewPassword("");
      toast.success("Password set.");
    } catch {
      toast.error("Unable to set password. Minimum length is 12 characters.");
    } finally {
      setPasswordSaving(false);
    }
  }

  async function runTransition(
    action: (id: string) => Promise<AdminUser>,
    label: string,
  ) {
    try {
      const updated = await action(userId);
      hydrate(updated);
      toast.success(label);
    } catch {
      toast.error(`Unable to ${label.toLowerCase()}.`);
    }
  }

  const updateButton = (
    <Button
      type="submit"
      form="guardian-user-editor-form"
      size="sm"
      disabled={saving}
      className={cn(filterApplyButtonClassName, "h-9")}
    >
      {saving ? "Saving…" : "Update user"}
    </Button>
  );

  if (!user) {
    if (loadError) {
      return (
        <ClinexaPage width="wide">
          <ErrorState title="Unable to load user">{loadError}</ErrorState>
        </ClinexaPage>
      );
    }
    return (
      <ClinexaPage width="wide">
        <PageSkeleton />
      </ClinexaPage>
    );
  }

  const sectionMeta: Record<
    UserTab,
    { title: string; description: string; actions?: React.ReactNode }
  > = {
    general: {
      title: "Identity",
      description: "Name, contact, and staff profile details.",
      actions: updateButton,
    },
    roles: {
      title: "Access & roles",
      description: "Assign platform roles. Saving revokes active sessions.",
      actions: (
        <Button
          type="button"
          size="sm"
          disabled={rolesSaving}
          className={cn(filterApplyButtonClassName, "h-9")}
          onClick={() => void onSaveRoles()}
        >
          {rolesSaving ? "Saving…" : "Save roles"}
        </Button>
      ),
    },
    patient: {
      title: "Patient info",
      description: "Demographics and billing identifiers.",
      actions: updateButton,
    },
    addresses: {
      title: "Addresses",
      description: "Billing and shipping snapshots for this account.",
      actions: updateButton,
    },
    security: {
      title: "Security",
      description: "Authentication status and password controls.",
    },
    preferences: {
      title: "Preferences",
      description: "Raw preference JSON and legacy internal notes.",
      actions: updateButton,
    },
    history: {
      title: "History",
      description: "Administrative change log for this user.",
    },
    activity: {
      title: "Activity",
      description: "Recent account activity events.",
    },
    future: {
      title: "More",
      description: "Additional management tools will land here.",
    },
  };

  const meta = sectionMeta[tab];

  return (
    <ClinexaPage width="wide" className="gap-4 sm:gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <Link
          href="/guardian/users"
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          ← All users
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {user.roles.length ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {user.roles.map((role) => (
                <span
                  key={role.code}
                  className="rounded-full border border-[#efd56a]/35 bg-[#efd56a]/15 px-2.5 py-0.5 text-xs font-medium text-[#5a4a12] dark:text-[#efd56a]"
                >
                  {role.name}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">No roles</span>
          )}
          <Button
            size="sm"
            className={cn(crossAppNavButtonClassName, "h-9")}
            render={<Link href={`/crm/users/${userId}`} />}
          >
            Open in CRM
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 truncate font-heading text-lg font-semibold tracking-tight sm:text-xl">
              {user.displayName ||
                [user.firstName, user.lastName].filter(Boolean).join(" ") ||
                user.email}
            </h1>
            <StatusBadge status={user.status} />
          </div>
          <p className="truncate text-sm text-muted-foreground">{user.email}</p>
        </div>
        <PillTabs value={tab} onChange={goToTab} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,320px)] lg:items-start lg:gap-5">
        <div className="min-w-0 perspective-[1400px]">
          <form id="guardian-user-editor-form" onSubmit={onSave}>
            <div key={tab} className="crm-section-flip min-w-0">
              <DetailSection
                title={meta.title}
                description={meta.description}
                actions={meta.actions}
                className="rounded-2xl shadow-sm dark:border-white/10"
              >
              {tab === "general" ? (
                <FieldGrid>
                  <Field label="First name" htmlFor="firstName">
                    <Input
                      id="firstName"
                      value={firstName}
                      onChange={(e) =>
                        setFirstName(sanitizePersonName(e.target.value))
                      }
                    />
                  </Field>
                  <Field label="Last name" htmlFor="lastName">
                    <Input
                      id="lastName"
                      value={lastName}
                      onChange={(e) =>
                        setLastName(sanitizePersonName(e.target.value))
                      }
                    />
                  </Field>
                  <Field label="Display name" htmlFor="displayName">
                    <Input
                      id="displayName"
                      value={displayName}
                      onChange={(e) =>
                        setDisplayName(sanitizeDisplayName(e.target.value))
                      }
                    />
                  </Field>
                  <Field label="Phone" htmlFor="phone">
                    <Input
                      id="phone"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="(555) 123-4567"
                      value={formatPhoneMask(phone)}
                      onChange={(e) => setPhone(toPhoneDigits(e.target.value))}
                    />
                  </Field>
                  <Field label="Bio" htmlFor="bio" className="sm:col-span-2">
                    <textarea
                      id="bio"
                      value={bio}
                      onChange={(e) =>
                        setBio(sanitizePlainText(e.target.value, 2000))
                      }
                      rows={3}
                      className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm dark:border-white/12"
                    />
                  </Field>
                  <Field label="Staff title" htmlFor="staffTitle">
                    <Input
                      id="staffTitle"
                      value={staffTitle}
                      maxLength={120}
                      onChange={(e) =>
                        setStaffTitle(sanitizePlainText(e.target.value, 120))
                      }
                    />
                  </Field>
                  <Field label="Credentials display" htmlFor="staffCredentials">
                    <Input
                      id="staffCredentials"
                      value={staffCredentials}
                      maxLength={120}
                      onChange={(e) =>
                        setStaffCredentials(
                          sanitizePlainText(e.target.value, 120),
                        )
                      }
                    />
                  </Field>
                </FieldGrid>
              ) : null}

              {tab === "roles" ? (
                <div className="space-y-4">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {roles.map((role) => {
                      const checked = selectedRoleCodes.includes(role.code);
                      return (
                        <label
                          key={role.code}
                          className={cn(
                            "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition-colors",
                            checked
                              ? "border-[#efd56a]/60 bg-[#efd56a]/12 dark:bg-[#efd56a]/10"
                              : "border-border hover:bg-muted/30 dark:border-white/10",
                          )}
                        >
                          <input
                            type="checkbox"
                            className="mt-1 accent-[#efd56a]"
                            checked={checked}
                            onChange={() =>
                              setSelectedRoleCodes((prev) =>
                                prev.includes(role.code)
                                  ? prev.filter((c) => c !== role.code)
                                  : [...prev, role.code],
                              )
                            }
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium">
                              {role.name}
                            </span>
                            <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">
                              {role.code}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="rounded-lg border border-amber-500/25 bg-amber-500/8 px-3 py-2 text-xs text-muted-foreground">
                    Replacing roles revokes all active sessions for this user.
                  </p>
                </div>
              ) : null}

              {tab === "patient" ? (
                <FieldGrid>
                  <Field label="Gender">
                    <AppSelect
                      value={gender}
                      onValueChange={(next) => setGender(next as UserGender)}
                      aria-label="Gender"
                      className="w-full"
                      options={GENDERS.map((g) => ({
                        value: g,
                        label: g,
                      }))}
                    />
                  </Field>
                  <Field label="Region" htmlFor="region">
                    <AppSelect
                      value={region}
                      onValueChange={setRegion}
                      aria-label="Region"
                      className="w-full"
                      options={[...ADDRESS_REGION_OPTIONS]}
                    />
                  </Field>
                  <Field label="Date of birth">
                    <Input value={user.dateOfBirth ?? "—"} disabled />
                  </Field>
                  <Field
                    label="Stripe customer id (live)"
                    htmlFor="stripeLive"
                  >
                    <Input
                      id="stripeLive"
                      value={stripeCustomerIdLive}
                      onChange={(e) => setStripeCustomerIdLive(e.target.value)}
                    />
                  </Field>
                  <Field
                    label="Stripe customer id (test)"
                    htmlFor="stripeTest"
                  >
                    <Input
                      id="stripeTest"
                      value={stripeCustomerIdTest}
                      onChange={(e) => setStripeCustomerIdTest(e.target.value)}
                    />
                  </Field>
                </FieldGrid>
              ) : null}

              {tab === "addresses" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <AddressFieldsEditor
                    label="Billing address"
                    value={billingAddress}
                    onChange={setBillingAddress}
                  />
                  <AddressFieldsEditor
                    label="Shipping address"
                    value={shippingAddress}
                    onChange={setShippingAddress}
                  />
                </div>
              ) : null}

              {tab === "security" ? (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-border/80 bg-muted/20 px-3 py-3 dark:border-white/10">
                      <div className="text-xs text-muted-foreground">
                        Two-factor
                      </div>
                      <div className="mt-1 text-sm font-medium capitalize">
                        {user.securitySummary.twoFactorStatus}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border/80 bg-muted/20 px-3 py-3 dark:border-white/10">
                      <div className="text-xs text-muted-foreground">
                        Failed logins
                      </div>
                      <div className="mt-1 text-sm font-medium">
                        {user.securitySummary.failedLoginCount}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border/80 bg-muted/20 px-3 py-3 dark:border-white/10">
                      <div className="text-xs text-muted-foreground">
                        Locked until
                      </div>
                      <div className="mt-1 text-sm font-medium">
                        {user.securitySummary.lockedUntil
                          ? formatDate(user.securitySummary.lockedUntil)
                          : "—"}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border/80 p-4 dark:border-white/10">
                    <div className="text-sm font-medium">Password reset</div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Send a password reset email to the user.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="mt-3"
                      onClick={() =>
                        void requestUserPasswordReset(userId)
                          .then(() =>
                            toast.success("Password reset email sent."),
                          )
                          .catch(() =>
                            toast.error("Unable to send password reset."),
                          )
                      }
                    >
                      Send reset email
                    </Button>
                  </div>

                  <div className="rounded-xl border border-border/80 p-4 dark:border-white/10">
                    <div className="text-sm font-medium">Set password</div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Minimum 12 characters.
                    </p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <Input
                        type="password"
                        placeholder="New password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="sm:flex-1"
                      />
                      <Button
                        type="button"
                        size="sm"
                        disabled={passwordSaving || newPassword.length < 12}
                        className={cn(filterApplyButtonClassName, "h-9")}
                        onClick={() => void onSetPassword()}
                      >
                        {passwordSaving ? "Saving…" : "Set password"}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}

              {tab === "preferences" ? (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="preferences">Preferences (JSON)</Label>
                    <textarea
                      id="preferences"
                      value={preferencesText}
                      onChange={(e) => setPreferencesText(e.target.value)}
                      rows={12}
                      className="w-full rounded-xl border border-border bg-muted/25 px-3 py-3 font-mono text-xs leading-relaxed dark:border-white/12 dark:bg-black/20"
                    />
                  </div>
                  <div className="space-y-2 border-t border-border pt-4 dark:border-white/10">
                    <Label htmlFor="internalNotes">
                      Internal notes (legacy blob)
                    </Label>
                    <textarea
                      id="internalNotes"
                      value={internalNotes}
                      onChange={(e) => setInternalNotes(e.target.value)}
                      rows={5}
                      className="w-full rounded-xl border border-border bg-transparent px-3 py-2 text-sm dark:border-white/12"
                    />
                    <p className="text-xs text-muted-foreground">
                      Class D field — also shown in the Notes rail. Same data as
                      CRM.
                    </p>
                  </div>
                </div>
              ) : null}

              {tab === "history" ? (
                <ul className="space-y-2">
                  {historyRows.map((row) => (
                    <li
                      key={row.id}
                      className="flex items-start justify-between gap-3 rounded-xl border border-border/80 px-3 py-2.5 dark:border-white/10"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{row.action}</div>
                      </div>
                      <div className="shrink-0 text-xs text-muted-foreground">
                        {formatDate(row.createdAt)}
                      </div>
                    </li>
                  ))}
                  {!historyRows.length ? (
                    <li className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground dark:border-white/10">
                      No history yet.
                    </li>
                  ) : null}
                </ul>
              ) : null}

              {tab === "activity" ? (
                <ul className="space-y-2">
                  {activityRows.map((row) => (
                    <li
                      key={row.id}
                      className="rounded-xl border border-border/80 px-3 py-2.5 dark:border-white/10"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 text-sm font-medium">
                          {row.summary}
                        </div>
                        <div className="shrink-0 text-xs text-muted-foreground">
                          {formatDate(row.createdAt)}
                        </div>
                      </div>
                      <div className="mt-1 text-xs capitalize text-muted-foreground">
                        {row.kind}
                      </div>
                    </li>
                  ))}
                  {!activityRows.length ? (
                    <li className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground dark:border-white/10">
                      No activity yet.
                    </li>
                  ) : null}
                </ul>
              ) : null}

              {tab === "future" ? (
                <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center dark:border-white/10">
                  <p className="text-sm text-muted-foreground">
                    More user management features are coming soon.
                  </p>
                </div>
              ) : null}
              </DetailSection>
            </div>
          </form>
        </div>

        <div className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-4">
          <LifecycleRail
            user={user}
            userId={userId}
            collapsed={statusCollapsed}
            onToggleCollapsed={() => setStatusCollapsed((open) => !open)}
            onTransition={runTransition}
            onDeleted={() => router.push("/guardian/users")}
          />
          <CrmNotesRail
            notes={userNotes}
            internalNotes={internalNotes}
            notesCollapsed={notesCollapsed}
            onToggleCollapsed={() => setNotesCollapsed((open) => !open)}
            addingNote={addingNote}
            deletingNoteId={deletingNoteId}
            onAddNote={onAddNote}
            onDeleteNote={onDeleteNote}
          />
        </div>
      </div>
    </ClinexaPage>
  );
}
