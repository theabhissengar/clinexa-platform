"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ChevronDown,
  ChevronUp,
  ClipboardList,
  CreditCard,
  FileText,
  MapPin,
  Plus,
  Stethoscope,
  Tag,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  AppSelect,
  ClinexaPage,
  ErrorState,
  FieldGrid,
  PageBody,
  PageSkeleton,
  crossAppNavButtonClassName,
  filterApplyButtonClassName,
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
import { NotesTimeline } from "@/features/shared/components/notes-timeline";
import { listCrmSubscriptions } from "@/features/subscriptions/api/subscriptions-api";
import {
  addCrmUserNote,
  deleteCrmUserNote,
  getCrmUser,
  listCrmUserNotes,
  updateCrmUser,
} from "@/features/users/api/users-api";
import { AddressFieldsEditor } from "@/features/users/components/address-fields-editor";
import {
  UserAvatarThumb,
  UserMediaImageField,
} from "@/features/users/components/user-media-image-field";
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
  MedicalProfile,
  OperationalUser,
  SavedPaymentMethod,
  UserGender,
  UserNote,
} from "@/features/users/types";
import { cn } from "@/lib/utils";

const GENDERS: UserGender[] = ["UNSPECIFIED", "MALE", "FEMALE", "OTHER"];

const PAYMENT_METHOD_OPTIONS = [
  { value: "", label: "Select payment method" },
  { value: "Visa", label: "Visa" },
  { value: "Mastercard", label: "Mastercard" },
  { value: "Amex", label: "American Express" },
  { value: "Discover", label: "Discover" },
];

type SectionId =
  | "profile"
  | "medical"
  | "payments"
  | "addresses"
  | "documents";

type MedicalTabId =
  | "medical"
  | "orders"
  | "subscriptions"
  | "prescriptions"
  | "questionnaires";

type UserDocument = {
  id: string;
  name: string;
  sizeLabel: string;
  addedAt: string;
  objectUrl: string;
};

const SECTIONS: Array<{
  id: SectionId;
  label: string;
  description: string;
  icon: typeof UserRound;
}> = [
  {
    id: "profile",
    label: "Profile",
    description: "Identity and contact details",
    icon: UserRound,
  },
  {
    id: "medical",
    label: "Medical Profile",
    description: "Clinical data, orders, and care history",
    icon: Stethoscope,
  },
  {
    id: "payments",
    label: "Payments",
    description: "Saved payment methods",
    icon: CreditCard,
  },
  {
    id: "addresses",
    label: "Billing & Shipping",
    description: "Address book for fulfillment",
    icon: MapPin,
  },
  {
    id: "documents",
    label: "Documents",
    description: "Files and attachments",
    icon: FileText,
  },
];

const MEDICAL_TABS: Array<{ id: MedicalTabId; label: string }> = [
  { id: "medical", label: "Medical" },
  { id: "orders", label: "Orders" },
  { id: "subscriptions", label: "Subscriptions" },
  { id: "prescriptions", label: "Prescriptions" },
  { id: "questionnaires", label: "Questionnaires" },
];

const SECTION_IDS = new Set<SectionId>(
  SECTIONS.map((section) => section.id),
);

const TAG_OPTIONS = [
  "VIP",
  "High priority",
  "Follow-up",
  "Insurance pending",
  "New patient",
  "Clinical hold",
];

function parseSectionSlug(slug: string | undefined): SectionId {
  if (slug && SECTION_IDS.has(slug as SectionId)) {
    return slug as SectionId;
  }
  return "profile";
}

type Address = UserAddressForm;
const EMPTY_ADDRESS = EMPTY_USER_ADDRESS;

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function userName(user: OperationalUser): string {
  return (
    user.displayName ||
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    user.email
  );
}

function SectionSurface({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-2xl border border-border bg-card p-4 shadow-sm ring-1 ring-foreground/5 sm:p-5",
        className,
      )}
    >
      {title ? (
        <header className="mb-4 border-b border-border/70 pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                {title}
              </h2>
              {description ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {description}
                </p>
              ) : null}
            </div>
            {actions ? (
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {actions}
              </div>
            ) : null}
          </div>
        </header>
      ) : null}
      {children}
    </section>
  );
}

function EmptyHint({
  icon: Icon,
  children,
}: {
  icon: typeof FileText;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-dashed border-border bg-muted/25 px-4 py-5 text-sm text-muted-foreground">
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>{children}</p>
    </div>
  );
}

export function CrmUserDetailPage({
  sectionSlug,
}: {
  sectionSlug?: string;
} = {}) {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const userId = params.id;
  const [activeSection, setActiveSection] = useState<SectionId>(() =>
    parseSectionSlug(sectionSlug),
  );
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
  const [medicalTab, setMedicalTab] = useState<MedicalTabId>("medical");
  const [notesCollapsed, setNotesCollapsed] = useState(true);
  const [tagsCollapsed, setTagsCollapsed] = useState(true);
  const [tags, setTags] = useState<string[]>([]);
  const [pendingTag, setPendingTag] = useState("");
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState<UserGender>("UNSPECIFIED");
  const [region, setRegion] = useState("");
  const [avatarMediaAssetId, setAvatarMediaAssetId] = useState<string | null>(
    null,
  );
  const [profileImageMediaAssetId, setProfileImageMediaAssetId] = useState<
    string | null
  >(null);
  const [healthCardMediaAssetId, setHealthCardMediaAssetId] = useState<
    string | null
  >(null);
  const [internalNotes, setInternalNotes] = useState("");
  const [medicalProfile, setMedicalProfile] = useState<MedicalProfile | null>(
    null,
  );
  const [billingAddress, setBillingAddress] = useState<Address>(EMPTY_ADDRESS);
  const [shippingAddress, setShippingAddress] =
    useState<Address>(EMPTY_ADDRESS);

  const [showAddCard, setShowAddCard] = useState(false);
  const [cardPaymentMethod, setCardPaymentMethod] = useState("");
  const [cardFirstName, setCardFirstName] = useState("");
  const [cardLastName, setCardLastName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiration, setCardExpiration] = useState("");
  const [cardCvv, setCardCvv] = useState("");

  const [documents, setDocuments] = useState<UserDocument[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputId = useId();

  const hydrate = useCallback((next: OperationalUser) => {
    setUser(next);
    setFirstName(next.firstName ?? "");
    setLastName(next.lastName ?? "");
    setDisplayName(next.displayName ?? "");
    setPhone(toPhoneDigits(next.phone ?? ""));
    setGender(next.gender);
    setRegion(next.region ?? "");
    setAvatarMediaAssetId(next.avatarMediaAssetId ?? null);
    setProfileImageMediaAssetId(next.profileImageMediaAssetId ?? null);
    setHealthCardMediaAssetId(next.healthCardMediaAssetId ?? null);
    setTags(next.tags ?? []);
    setInternalNotes(next.internalNotes ?? "");
    setMedicalProfile(next.medicalProfile);
    setBillingAddress(addressFromJson(next.billingAddress));
    setShippingAddress(addressFromJson(next.shippingAddress));
  }, []);

  useEffect(() => {
    if (sectionSlug && !SECTION_IDS.has(sectionSlug as SectionId)) {
      router.replace(`/crm/users/${userId}?section=profile`);
      return;
    }
    setActiveSection(parseSectionSlug(sectionSlug));
  }, [sectionSlug, router, userId]);

  function goToSection(section: SectionId) {
    if (section === activeSection) return;
    setActiveSection(section);
    router.replace(`/crm/users/${userId}?section=${section}`, {
      scroll: false,
    });
  }

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

  async function onSaveProfile(event?: React.FormEvent) {
    event?.preventDefault();
    if (!user) return;

    const profileError = validateUserProfileFields({
      firstName,
      lastName,
      displayName,
      phone,
      region,
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
    setError(null);
    try {
      const updated = await updateCrmUser(user.id, {
        firstName: firstName || null,
        lastName: lastName || null,
        displayName: displayName || null,
        phone: phone || null,
        gender,
        region: region || null,
        avatarMediaAssetId,
        profileImageMediaAssetId,
        healthCardMediaAssetId,
        tags,
        medicalProfile,
        billingAddress: addressToJson(billingAddress),
        shippingAddress: addressToJson(shippingAddress),
      });
      hydrate(updated);
      toast.success("User updated.");
    } catch {
      setError("Unable to save user.");
      toast.error("Unable to save user.");
    } finally {
      setSaving(false);
    }
  }

  async function onSaveTags(nextTags: string[]) {
    if (!user) return;
    setTags(nextTags);
    setSaving(true);
    try {
      const updated = await updateCrmUser(user.id, { tags: nextTags });
      hydrate(updated);
      toast.success("Tags updated.");
    } catch {
      toast.error("Unable to update tags.");
    } finally {
      setSaving(false);
    }
  }

  function addTag(raw: string) {
    const next = raw.trim();
    if (!next) return;
    if (tags.includes(next)) {
      setPendingTag("");
      return;
    }
    void onSaveTags([...tags, next]);
    setPendingTag("");
  }

  function commitPendingTag() {
    addTag(pendingTag);
  }

  function removeTag(tag: string) {
    void onSaveTags(tags.filter((item) => item !== tag));
  }

  async function onAddNote(
    body: string,
    visibility: "PRIVATE" | "USER_VISIBLE",
  ) {
    if (!user) return;
    setAddingNote(true);
    try {
      await addCrmUserNote(user.id, body, visibility);
      const refreshed = await listCrmUserNotes(user.id);
      setNotes(refreshed);
      toast.success("Note added.");
    } catch {
      setError("Unable to add note.");
      toast.error("Unable to add note.");
    } finally {
      setAddingNote(false);
    }
  }

  async function onDeleteNote(noteId: string) {
    if (!user) return;
    setDeletingNoteId(noteId);
    try {
      await deleteCrmUserNote(user.id, noteId);
      setNotes((prev) => prev.filter((note) => note.id !== noteId));
      toast.success("Note deleted.");
    } catch {
      toast.error("Unable to delete note.");
    } finally {
      setDeletingNoteId(null);
    }
  }

  function resetCardForm() {
    setCardPaymentMethod("");
    setCardFirstName("");
    setCardLastName("");
    setCardNumber("");
    setCardExpiration("");
    setCardCvv("");
  }

  async function onAddPaymentMethod() {
    if (!user) return;
    const digits = cardNumber.replace(/\D/g, "");
    if (!cardPaymentMethod || digits.length < 4) {
      toast.error("Enter a payment method and card number.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const expParts = cardExpiration.split(/[/\-]/).map((p) => p.trim());
      const expMonth = Number(expParts[0]) || undefined;
      const expYearRaw = expParts[1];
      const expYear = expYearRaw
        ? Number(expYearRaw.length === 2 ? `20${expYearRaw}` : expYearRaw)
        : undefined;
      await addCrmPaymentMethod(user.id, {
        brand: cardPaymentMethod,
        last4: digits.slice(-4),
        expMonth,
        expYear,
        isDefault: paymentMethods.length === 0,
      });
      const methods = await listCrmPaymentMethods(user.id);
      setPaymentMethods(methods);
      resetCardForm();
      setShowAddCard(false);
      toast.success("Payment method added.");
    } catch {
      setError("Unable to add payment method.");
      toast.error("Unable to add payment method.");
    } finally {
      setSaving(false);
    }
  }

  function onAddDocuments(files: FileList | null) {
    if (!files?.length) return;
    const next: UserDocument[] = Array.from(files).map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
      name: file.name,
      sizeLabel: formatBytes(file.size),
      addedAt: new Date().toISOString(),
      objectUrl: URL.createObjectURL(file),
    }));
    setDocuments((prev) => [...next, ...prev]);
    toast.success(
      next.length === 1 ? "Document added." : `${next.length} documents added.`,
    );
  }

  function onDeleteDocument(id: string) {
    setDocuments((prev) => {
      const target = prev.find((doc) => doc.id === id);
      if (target) URL.revokeObjectURL(target.objectUrl);
      return prev.filter((doc) => doc.id !== id);
    });
    toast.success("Document removed.");
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

  const currentUser = user;
  const activeMeta =
    SECTIONS.find((s) => s.id === activeSection) ?? SECTIONS[0]!;

  const notesAndTagsRail = (
    <div className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-4">
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
          onClick={() => setNotesCollapsed((open) => !open)}
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

      <aside
        className={cn(
          "shrink-0 overflow-hidden rounded-2xl shadow-sm",
          tagsCollapsed
            ? "border-0 bg-slate-800 dark:bg-slate-900"
            : cn(
                "border border-slate-200/90 bg-[linear-gradient(180deg,#eef4fb_0%,#e7eef8_55%,#e2ebf5_100%)] ring-1 ring-slate-900/5",
                "dark:border-slate-700 dark:bg-[linear-gradient(180deg,#1a2332_0%,#172033_100%)] dark:ring-slate-900/40",
              ),
        )}
      >
        <button
          type="button"
          className={cn(
            "flex w-full items-start gap-2 bg-slate-800 px-4 py-3 text-left transition-colors hover:bg-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800",
            !tagsCollapsed && "border-b border-slate-700/80",
          )}
          aria-expanded={!tagsCollapsed}
          onClick={() => setTagsCollapsed((open) => !open)}
        >
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-tight text-white">
              <Tag className="size-3.5" aria-hidden />
              Tags
            </h2>
            <p className="mt-0.5 text-xs text-slate-300">
              Assign labels for triage and follow-up
            </p>
          </div>
          <span
            className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full text-white"
            aria-hidden
          >
            {tagsCollapsed ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronUp className="size-4" />
            )}
          </span>
        </button>
        {!tagsCollapsed ? (
          <div className="space-y-3 p-4">
            {tags.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No tags assigned yet.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <li
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                  >
                    {tag}
                    <button
                      type="button"
                      className="rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                      aria-label={`Remove ${tag}`}
                      onClick={() => removeTag(tag)}
                    >
                      <X className="size-3" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label className="text-slate-700 dark:text-slate-200">
                  Add tag
                </Label>
                <AppSelect
                  value={pendingTag}
                  onValueChange={setPendingTag}
                  aria-label="Add tag"
                  placeholder={
                    TAG_OPTIONS.every((option) => tags.includes(option))
                      ? "All preset tags added"
                      : "Add tag"
                  }
                  className="w-full"
                  disabled={
                    saving ||
                    TAG_OPTIONS.every((option) => tags.includes(option))
                  }
                  options={TAG_OPTIONS.filter(
                    (option) => !tags.includes(option),
                  ).map((option) => ({ value: option, label: option }))}
                />
              </div>
              <Button
                type="button"
                size="sm"
                className="h-9 shrink-0 bg-slate-800 text-white hover:bg-slate-700"
                disabled={saving || !pendingTag.trim()}
                onClick={() => commitPendingTag()}
              >
                Add
              </Button>
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );

  function renderMedicalTab() {
    switch (medicalTab) {
      case "medical":
        return (
          <div className="space-y-3">
            <MedicalProfileEditor
              value={medicalProfile}
              onChange={setMedicalProfile}
              disabled={saving}
            />
          </div>
        );
      case "orders":
        return orders.length === 0 ? (
          <p className="text-sm text-muted-foreground">No orders.</p>
        ) : (
          <ul className="space-y-2">
            {orders.map((order) => (
              <li
                key={order.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/80 bg-muted/20 px-3 py-2.5"
              >
                <Link
                  href={`/crm/orders/${order.id}`}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {order.orderNumber}
                </Link>
                <StatusBadge status={order.status} />
              </li>
            ))}
          </ul>
        );
      case "subscriptions":
        return subscriptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No subscriptions.</p>
        ) : (
          <ul className="space-y-2">
            {subscriptions.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/80 bg-muted/20 px-3 py-2.5"
              >
                <Link
                  href={`/crm/subscriptions/${row.id}`}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {row.subscriptionNumber ?? row.id}
                </Link>
                <StatusBadge status={row.status} />
              </li>
            ))}
          </ul>
        );
      case "prescriptions":
        return (
          <EmptyHint icon={Stethoscope}>
            Prescription management is coming soon in a future phase.
          </EmptyHint>
        );
      case "questionnaires":
        return (
          <EmptyHint icon={ClipboardList}>
            Questionnaire responses are coming soon in a future phase.
          </EmptyHint>
        );
      default:
        return null;
    }
  }

  function renderMain() {
    switch (activeSection) {
      case "profile":
        return (
          <SectionSurface
            title="Profile"
            description="Identity, contact details, and identity documents"
            actions={
              <Button
                type="submit"
                form="crm-user-profile-form"
                className={cn(filterApplyButtonClassName, "h-9")}
                disabled={saving}
              >
                {saving ? "Saving…" : "Update profile"}
              </Button>
            }
          >
            <form
              id="crm-user-profile-form"
              onSubmit={(e) => void onSaveProfile(e)}
              className="space-y-6"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <UserAvatarThumb
                  assetId={avatarMediaAssetId ?? profileImageMediaAssetId}
                  name={displayName || firstName || "User"}
                  size="lg"
                  className="ring-2 ring-[#efd56a]/70 ring-offset-2 ring-offset-background"
                />
                <div className="min-w-0 space-y-1">
                  <h3 className="truncate text-lg font-semibold tracking-tight">
                    {displayName ||
                      [firstName, lastName].filter(Boolean).join(" ") ||
                      "Unnamed user"}
                  </h3>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold tracking-tight">
                    Contact details
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Keep identity fields current for fulfillment and outreach.
                  </p>
                </div>
                <FieldGrid columns={2}>
                  <div className="space-y-1.5">
                    <Label htmlFor="firstName">First name</Label>
                    <Input
                      id="firstName"
                      value={firstName}
                      onChange={(e) =>
                        setFirstName(sanitizePersonName(e.target.value))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lastName">Last name</Label>
                    <Input
                      id="lastName"
                      value={lastName}
                      onChange={(e) =>
                        setLastName(sanitizePersonName(e.target.value))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="displayName">Display name</Label>
                    <Input
                      id="displayName"
                      value={displayName}
                      onChange={(e) =>
                        setDisplayName(sanitizeDisplayName(e.target.value))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="(555) 123-4567"
                      value={formatPhoneMask(phone)}
                      onChange={(e) => setPhone(toPhoneDigits(e.target.value))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="gender">Gender</Label>
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
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="region">Region</Label>
                    <AppSelect
                      value={region}
                      onValueChange={setRegion}
                      aria-label="Region"
                      className="w-full"
                      options={[...ADDRESS_REGION_OPTIONS]}
                    />
                  </div>
                </FieldGrid>
              </div>

              <div
                className={cn(
                  "space-y-3 rounded-2xl border p-4 ring-1 sm:p-5",
                  "border-[#d9d2c4] bg-[#f3efe6] ring-black/5",
                  "dark:border-white/12 dark:bg-[#22252b] dark:[background-image:none] dark:ring-white/8",
                )}
              >
                <div>
                  <h3 className="text-sm font-semibold tracking-tight text-[#1c1c1c] dark:text-[#f4f1ea]">
                    Identity images
                  </h3>
                  <p className="text-xs text-[#6b675f] dark:text-white/55">
                    Profile photo, avatar, and insurance card — separate from
                    contact fields above.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <UserMediaImageField
                    label="Profile image"
                    hint="Larger photo shown on this profile"
                    value={profileImageMediaAssetId}
                    onChange={setProfileImageMediaAssetId}
                    aspect="portrait"
                    tone="media"
                  />
                  <UserMediaImageField
                    label="Avatar"
                    hint="Circular image beside the user name in lists"
                    value={avatarMediaAssetId}
                    onChange={setAvatarMediaAssetId}
                    aspect="square"
                    rounded="full"
                    tone="media"
                  />
                  <div className="sm:col-span-2 xl:col-span-1">
                    <UserMediaImageField
                      label="Insurance card"
                      hint="Front of insurance / health card"
                      value={healthCardMediaAssetId}
                      onChange={setHealthCardMediaAssetId}
                      aspect="wide"
                      tone="media"
                    />
                  </div>
                </div>
              </div>
            </form>
          </SectionSurface>
        );
      case "medical":
        return (
          <SectionSurface
            title="Medical Profile"
            description={activeMeta.description}
            actions={
              medicalTab === "medical" ? (
                <Button
                  type="button"
                  className={cn(filterApplyButtonClassName, "h-9")}
                  disabled={saving}
                  onClick={() => void onSaveProfile()}
                >
                  {saving ? "Saving…" : "Save medical profile"}
                </Button>
              ) : null
            }
          >
            <div
              role="tablist"
              aria-label="Medical profile sections"
              className="mb-4 flex flex-wrap gap-1.5 rounded-xl bg-muted/40 p-1"
            >
              {MEDICAL_TABS.map((tab) => {
                const selected = medicalTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-sm transition-colors",
                      selected
                        ? "bg-[#1c1c1c] font-medium text-[#efd56a] shadow-sm dark:bg-[#efd56a] dark:text-[#1c1c1c]"
                        : "text-muted-foreground hover:bg-background/80 hover:text-foreground",
                    )}
                    onClick={() => setMedicalTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
            {renderMedicalTab()}
          </SectionSurface>
        );
      case "payments":
        return (
          <SectionSurface
            title="Payments"
            description={activeMeta.description}
            actions={
              !showAddCard ? (
                <Button
                  type="button"
                  size="sm"
                  className={cn(filterApplyButtonClassName, "h-9")}
                  onClick={() => {
                    resetCardForm();
                    setShowAddCard(true);
                  }}
                >
                  <Plus className="size-4" aria-hidden />
                  Add card
                </Button>
              ) : null
            }
          >
            {paymentMethods.length === 0 ? (
              <p className="mb-4 text-sm text-muted-foreground">
                No saved payment methods.
              </p>
            ) : (
              <ul className="mb-4 space-y-2">
                {paymentMethods.map((method) => (
                  <li
                    key={method.id}
                    className="flex flex-wrap items-center gap-2 rounded-xl border border-border/80 bg-muted/20 px-3 py-2.5 text-sm"
                  >
                    <span className="min-w-0 flex-1 font-medium">
                      {method.brand ?? "Card"} ···{method.last4 ?? "????"}
                      {method.isDefault ? (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          Default
                        </span>
                      ) : null}
                    </span>
                    {!method.isDefault ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={saving}
                        onClick={() =>
                          void makeCrmPaymentMethodDefault(
                            currentUser.id,
                            method.id,
                          )
                            .then(() =>
                              listCrmPaymentMethods(currentUser.id),
                            )
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
                        void deleteCrmPaymentMethod(currentUser.id, method.id)
                          .then(() => listCrmPaymentMethods(currentUser.id))
                          .then(setPaymentMethods)
                      }
                    >
                      Delete
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {showAddCard ? (
              <div className="space-y-3 rounded-xl border border-border/70 bg-muted/15 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">Add payment method</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setShowAddCard(false);
                      resetCardForm();
                    }}
                  >
                    Cancel
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Payment method</Label>
                    <AppSelect
                      value={cardPaymentMethod}
                      onValueChange={setCardPaymentMethod}
                      aria-label="Payment method"
                      className="w-full"
                      options={PAYMENT_METHOD_OPTIONS}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cardFirstName">First name</Label>
                    <Input
                      id="cardFirstName"
                      autoComplete="off"
                      value={cardFirstName}
                      onChange={(e) => setCardFirstName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cardLastName">Last name</Label>
                    <Input
                      id="cardLastName"
                      autoComplete="off"
                      value={cardLastName}
                      onChange={(e) => setCardLastName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="cardNumber">Card number</Label>
                    <Input
                      id="cardNumber"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="•••• •••• •••• ••••"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cardExpiration">Expiration date</Label>
                    <Input
                      id="cardExpiration"
                      autoComplete="off"
                      placeholder="MM/YY"
                      value={cardExpiration}
                      onChange={(e) => setCardExpiration(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cardCvv">CVV</Label>
                    <Input
                      id="cardCvv"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="•••"
                      value={cardCvv}
                      onChange={(e) => setCardCvv(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    className={cn(filterApplyButtonClassName, "h-9")}
                    disabled={saving}
                    onClick={() => void onAddPaymentMethod()}
                  >
                    {saving ? "Saving…" : "Save card"}
                  </Button>
                </div>
              </div>
            ) : null}
          </SectionSurface>
        );
      case "addresses":
        return (
          <SectionSurface
            title="Billing & Shipping"
            description={activeMeta.description}
            actions={
              <Button
                type="button"
                className={cn(filterApplyButtonClassName, "h-9")}
                disabled={saving}
                onClick={() => void onSaveProfile()}
              >
                {saving ? "Saving…" : "Save addresses"}
              </Button>
            }
          >
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
          </SectionSurface>
        );
      case "documents":
        return (
          <SectionSurface
            title="Documents"
            description={activeMeta.description}
            actions={
              <>
                <input
                  ref={fileInputRef}
                  id={fileInputId}
                  type="file"
                  className="sr-only"
                  multiple
                  onChange={(e) => {
                    onAddDocuments(e.target.files);
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  className={cn(filterApplyButtonClassName, "h-9")}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Plus className="size-4" aria-hidden />
                  Add Doc
                </Button>
              </>
            }
          >
            {documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No documents yet. Use Add Doc to attach files for this patient.
              </p>
            ) : (
              <ul className="space-y-2">
                {documents.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex flex-wrap items-center gap-2 rounded-xl border border-border/80 bg-muted/20 px-3 py-2.5 text-sm"
                  >
                    <FileText
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{doc.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {doc.sizeLabel}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100 hover:text-sky-900"
                      render={
                        <a
                          href={doc.objectUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        />
                      }
                    >
                      View
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={() => onDeleteDocument(doc.id)}
                    >
                      Delete
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </SectionSurface>
        );
      default:
        return null;
    }
  }

  return (
    <ClinexaPage width="wide" className="gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/crm/users"
          className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          ← All users
        </Link>
        <Button
          size="sm"
          className={crossAppNavButtonClassName}
          render={
            <Link
              href={`/guardian/users/${currentUser.id}/edit`}
              target="_blank"
              rel="noopener noreferrer"
            />
          }
        >
          Manage in Guardian
        </Button>
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <PageBody className="gap-4">
        <nav
          aria-label="User sections"
          className="flex gap-1.5 overflow-x-auto pb-1 lg:hidden"
        >
          {SECTIONS.map((section) => {
            const selected = activeSection === section.id;
            const Icon = section.icon;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => goToSection(section.id)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                  selected
                    ? "border-[#1c1c1c] bg-[#1c1c1c] text-[#efd56a]"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" aria-hidden />
                {section.label}
              </button>
            );
          })}
        </nav>

        <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[15rem_minmax(0,1fr)_19rem] lg:items-start xl:grid-cols-[16rem_minmax(0,1fr)_20rem]">
          <nav
            aria-label="User sections"
            className={cn(
              "hidden overflow-hidden rounded-2xl border p-1.5 shadow-sm lg:sticky lg:top-4 lg:block",
              "border-border bg-[linear-gradient(180deg,#ece9e3_0%,#e4e0d8_100%)] ring-1 ring-black/5",
              "dark:border-white/12 dark:bg-[#1c1e22] dark:[background-image:none] dark:ring-white/10",
            )}
          >
            <ul className="flex flex-col gap-1">
              {SECTIONS.map((section) => {
                const selected = activeSection === section.id;
                const Icon = section.icon;
                return (
                  <li key={section.id}>
                    <button
                      type="button"
                      onClick={() => goToSection(section.id)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
                        selected
                          ? "bg-[#1c1c1c] font-medium text-[#efd56a] shadow-sm dark:bg-[#efd56a] dark:text-[#1c1c1c]"
                          : "text-[#4a463e] hover:bg-white/60 dark:text-[#c8c4bc] dark:hover:bg-white/10 dark:hover:text-white",
                      )}
                    >
                      <Icon
                        className="size-4 shrink-0 opacity-80"
                        aria-hidden
                      />
                      <span className="min-w-0 truncate">{section.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="min-w-0 [perspective:1400px]">
            <div key={activeSection} className="crm-section-flip min-w-0">
              {renderMain()}
            </div>
          </div>

          <div className="min-w-0 lg:block">{notesAndTagsRail}</div>
        </div>
      </PageBody>
    </ClinexaPage>
  );
}
