"use client";

import { Inbox } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import {
  AppSelect,
  ClearableSearchInput,
  ClickableTableRow,
  ClinexaPage,
  CollapsibleFilterFields,
  DEFAULT_LIST_PAGE_SIZE,
  DataTable,
  DateField,
  EmptyState,
  ErrorState,
  FilterControl,
  FilterFieldsToggle,
  FilterPanel,
  LIST_PAGE_SIZE_OPTIONS,
  ListPaginationBar,
  PageBody,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  filterApplyButtonClassName,
  filterControlCompactClassName,
  filterFieldsRowClassName,
} from "@/components/patterns";
import { Button } from "@/components/ui/button";
import { Roles } from "@/features/auth/permissions";
import { listCrmUsers } from "@/features/users/api/users-api";
import { UserAvatarThumb } from "@/features/users/components/user-media-image-field";
import type { OperationalUser } from "@/features/users/types";
import { cn } from "@/lib/utils";

const PAGE_SIZE_SET = new Set<number>(LIST_PAGE_SIZE_OPTIONS);

const TAG_OPTIONS = [
  "VIP",
  "High priority",
  "Follow-up",
  "Insurance pending",
  "New patient",
  "Clinical hold",
] as const;

const ROLE_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: Roles.PATIENT, label: "Patient" },
  { value: Roles.DOCTOR, label: "Doctor" },
  { value: Roles.PHARMACIST, label: "Pharmacist" },
  { value: Roles.SUPPORT, label: "Support" },
  { value: Roles.OPERATIONS, label: "Operations" },
  { value: Roles.MARKETING, label: "Marketing" },
  { value: Roles.CONTENT, label: "Content" },
  { value: Roles.ADMINISTRATOR, label: "Administrator" },
  { value: Roles.SUPER_ADMINISTRATOR, label: "Super administrator" },
];

function parsePage(value: string | null): number {
  const n = Number(value ?? "1");
  if (!Number.isFinite(n) || n < 1) return 0;
  return Math.floor(n) - 1;
}

function parsePageSize(value: string | null): number {
  const n = Number(value ?? DEFAULT_LIST_PAGE_SIZE);
  if (PAGE_SIZE_SET.has(n)) return n;
  return DEFAULT_LIST_PAGE_SIZE;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

function userName(user: OperationalUser): string {
  return (
    user.displayName ||
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    user.email
  );
}

export function CrmUsersListPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const appliedQ = searchParams.get("q") ?? "";
  const appliedRole = searchParams.get("role") ?? "";
  const appliedTag = searchParams.get("tag") ?? "";
  const appliedCreatedFrom = searchParams.get("createdFrom") ?? "";
  const appliedCreatedTo = searchParams.get("createdTo") ?? "";
  const appliedUpdatedFrom = searchParams.get("updatedFrom") ?? "";
  const appliedUpdatedTo = searchParams.get("updatedTo") ?? "";
  const page = parsePage(searchParams.get("page"));
  const pageSize = parsePageSize(searchParams.get("take"));

  const appliedKey = [
    appliedQ,
    appliedRole,
    appliedTag,
    appliedCreatedFrom,
    appliedCreatedTo,
    appliedUpdatedFrom,
    appliedUpdatedTo,
  ].join("|");

  const [draftQ, setDraftQ] = useState(appliedQ);
  const [draftRole, setDraftRole] = useState(appliedRole);
  const [draftTag, setDraftTag] = useState(appliedTag);
  const [draftCreatedFrom, setDraftCreatedFrom] = useState(
    appliedCreatedFrom.slice(0, 10),
  );
  const [draftCreatedTo, setDraftCreatedTo] = useState(
    appliedCreatedTo.slice(0, 10),
  );
  const [draftUpdatedFrom, setDraftUpdatedFrom] = useState(
    appliedUpdatedFrom.slice(0, 10),
  );
  const [draftUpdatedTo, setDraftUpdatedTo] = useState(
    appliedUpdatedTo.slice(0, 10),
  );
  const [syncedKey, setSyncedKey] = useState(appliedKey);
  const [items, setItems] = useState<OperationalUser[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(true);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  if (appliedKey !== syncedKey) {
    setSyncedKey(appliedKey);
    setDraftQ(appliedQ);
    setDraftRole(appliedRole);
    setDraftTag(appliedTag);
    setDraftCreatedFrom(appliedCreatedFrom.slice(0, 10));
    setDraftCreatedTo(appliedCreatedTo.slice(0, 10));
    setDraftUpdatedFrom(appliedUpdatedFrom.slice(0, 10));
    setDraftUpdatedTo(appliedUpdatedTo.slice(0, 10));
  }

  function writeParams(patch: Record<string, string | null | undefined>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value == null || value === "" || value === "ALL") next.delete(key);
      else next.set(key, value);
    }
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const result = await listCrmUsers({
          q: appliedQ || undefined,
          role: appliedRole || undefined,
          tag: appliedTag || undefined,
          createdFrom: appliedCreatedFrom || undefined,
          createdTo: appliedCreatedTo || undefined,
          updatedFrom: appliedUpdatedFrom || undefined,
          updatedTo: appliedUpdatedTo || undefined,
          skip: page * pageSize,
          take: pageSize,
        });
        if (cancelled) return;
        setItems(result.items);
        setTotal(result.total);
        setError(null);
      } catch {
        if (cancelled) return;
        setError("Unable to load users.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [
    appliedQ,
    appliedRole,
    appliedTag,
    appliedCreatedFrom,
    appliedCreatedTo,
    appliedUpdatedFrom,
    appliedUpdatedTo,
    page,
    pageSize,
  ]);

  function applyFilters() {
    writeParams({
      q: draftQ.trim() || null,
      role: draftRole || null,
      tag: draftTag || null,
      createdFrom: draftCreatedFrom
        ? new Date(draftCreatedFrom).toISOString()
        : null,
      createdTo: draftCreatedTo
        ? new Date(`${draftCreatedTo}T23:59:59.999Z`).toISOString()
        : null,
      updatedFrom: draftUpdatedFrom
        ? new Date(draftUpdatedFrom).toISOString()
        : null,
      updatedTo: draftUpdatedTo
        ? new Date(`${draftUpdatedTo}T23:59:59.999Z`).toISOString()
        : null,
      page: "1",
    });
  }

  return (
    <ClinexaPage width="wide" className="gap-6">
      <PageBody>
        <FilterPanel>
          <div className="grid grid-cols-1 items-center gap-2 md:grid-cols-[minmax(0,1fr)_minmax(12rem,min(100%,28rem))_minmax(0,1fr)]">
            <div className="order-2 flex justify-start md:order-1">
              <FilterFieldsToggle
                open={filtersOpen}
                onOpenChange={setFiltersOpen}
              />
            </div>
            <form
              className="order-1 w-full min-w-0 md:order-2"
              onSubmit={(event) => {
                event.preventDefault();
                applyFilters();
              }}
            >
              <ClearableSearchInput
                value={draftQ}
                onChange={setDraftQ}
                onClear={() => setDraftQ("")}
                placeholder="Search users"
                className="w-full"
                aria-label="Search users"
              />
              <button type="submit" className="sr-only">
                Apply
              </button>
            </form>
            <div className="order-3 flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                size="sm"
                className={filterApplyButtonClassName}
                onClick={() => applyFilters()}
              >
                Apply
              </Button>
            </div>
          </div>

          <CollapsibleFilterFields open={filtersOpen}>
            <div className={filterFieldsRowClassName}>
              <FilterControl
                label="Role"
                className={filterControlCompactClassName}
              >
                <AppSelect
                  value={draftRole}
                  onValueChange={setDraftRole}
                  aria-label="Filter by role"
                  placeholder="All roles"
                  options={[
                    { value: "", label: "All roles" },
                    ...ROLE_FILTER_OPTIONS,
                  ]}
                />
              </FilterControl>
              <FilterControl
                label="Tag"
                className={filterControlCompactClassName}
              >
                <AppSelect
                  value={draftTag}
                  onValueChange={setDraftTag}
                  aria-label="Filter by tag"
                  placeholder="All tags"
                  options={[
                    { value: "", label: "All tags" },
                    ...TAG_OPTIONS.map((tag) => ({
                      value: tag,
                      label: tag,
                    })),
                  ]}
                />
              </FilterControl>
              <FilterControl
                label="Created from"
                className={filterControlCompactClassName}
              >
                <DateField
                  value={draftCreatedFrom}
                  onChange={setDraftCreatedFrom}
                  aria-label="Created from"
                />
              </FilterControl>
              <FilterControl
                label="Created to"
                className={filterControlCompactClassName}
              >
                <DateField
                  value={draftCreatedTo}
                  onChange={setDraftCreatedTo}
                  aria-label="Created to"
                />
              </FilterControl>
              <FilterControl
                label="Updated from"
                className={filterControlCompactClassName}
              >
                <DateField
                  value={draftUpdatedFrom}
                  onChange={setDraftUpdatedFrom}
                  aria-label="Updated from"
                />
              </FilterControl>
              <FilterControl
                label="Updated to"
                className={filterControlCompactClassName}
              >
                <DateField
                  value={draftUpdatedTo}
                  onChange={setDraftUpdatedTo}
                  aria-label="Updated to"
                />
              </FilterControl>
            </div>
          </CollapsibleFilterFields>
        </FilterPanel>

        <DataTable
          framed
          stickyFirstColumn
          loading={loading}
          empty={!loading && !error && items.length === 0}
          emptyState={
            <EmptyState
              icon={<Inbox />}
              title="No users found"
              description="Try a different search or filter."
            />
          }
          error={
            error ? (
              <ErrorState title="Unable to load users">{error}</ErrorState>
            ) : undefined
          }
          footer={
            <ListPaginationBar
              total={total}
              page={page}
              pageCount={pageCount}
              pageSize={pageSize}
              onPageSizeChange={(next) =>
                writeParams({
                  take:
                    next === DEFAULT_LIST_PAGE_SIZE ? null : String(next),
                  page: "1",
                })
              }
              onPrev={() =>
                writeParams({ page: page <= 0 ? null : String(page) })
              }
              onNext={() =>
                writeParams({ page: String(Math.min(pageCount, page + 2)) })
              }
            />
          }
        >
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Created at</TableHead>
              <TableHead>Updated at</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((user) => {
              const detailHref = `/crm/users/${user.id}?section=profile`;
              const tags = user.tags ?? [];
              return (
                <ClickableTableRow
                  href={detailHref}
                  key={user.id}
                  className="group align-top"
                  onMouseEnter={() => setHoveredId(user.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <TableCell>
                    <div className="flex min-w-0 items-start gap-2.5">
                      <UserAvatarThumb
                        assetId={
                          user.avatarMediaAssetId ??
                          user.profileImageMediaAssetId
                        }
                        name={userName(user)}
                        size="sm"
                        className="mt-0.5"
                      />
                      <div className="min-w-0">
                        <Link
                          href={detailHref}
                          className="font-semibold text-primary hover:underline"
                        >
                          {userName(user)}
                        </Link>
                        <div
                          className={cn(
                            "mt-1 text-xs leading-relaxed text-primary transition-opacity",
                            hoveredId === user.id
                              ? "opacity-100"
                              : "opacity-0 group-hover:opacity-100",
                          )}
                        >
                          <Link
                            href={`/guardian/users/${user.id}/edit`}
                            className="hover:underline"
                            onClick={(event) => event.stopPropagation()}
                          >
                            Manage in Guardian
                          </Link>
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-48 truncate text-muted-foreground">
                    {user.email}
                  </TableCell>
                  <TableCell>
                    {user.roles.length
                      ? user.roles.map((r) => r.name).join(", ")
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {tags.length === 0 ? (
                      <span className="text-muted-foreground">N/A</span>
                    ) : (
                      <div className="flex max-w-56 flex-wrap gap-1">
                        {tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex max-w-full truncate rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs font-medium text-foreground"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(user.createdAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(user.updatedAt)}
                  </TableCell>
                </ClickableTableRow>
              );
            })}
          </TableBody>
        </DataTable>
      </PageBody>
    </ClinexaPage>
  );
}
