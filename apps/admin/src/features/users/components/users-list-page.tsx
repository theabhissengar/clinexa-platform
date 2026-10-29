"use client";

import { Inbox } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import {
  AppSelect,
  ClearableSearchInput,
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
import { RequirePermission } from "@/components/auth/require-permission";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Permissions } from "@/features/auth/permissions";
import {
  archiveUser,
  deleteUser,
  listAdminUsers,
  listRoles,
  requestUserPasswordReset,
  restoreUser,
} from "@/features/users/api/users-api";
import type {
  AdminUser,
  Role,
  UserStatus,
  UserStatusCounts,
} from "@/features/users/types";
import { cn } from "@/lib/utils";

const STATUS_TABS: Array<{ key: UserStatus | "ALL"; label: string }> = [
  { key: "ALL", label: "All" },
  { key: "ACTIVE", label: "Active" },
  { key: "PENDING_VERIFICATION", label: "Pending" },
  { key: "SUSPENDED", label: "Suspended" },
  { key: "INACTIVE", label: "Inactive" },
  { key: "ARCHIVED", label: "Archived" },
  { key: "DELETED", label: "Deleted" },
];
const STATUS_KEYS = new Set(STATUS_TABS.map((t) => t.key));
const PAGE_SIZE_SET = new Set<number>(LIST_PAGE_SIZE_OPTIONS);

function parseStatus(value: string | null): UserStatus | "ALL" {
  if (value && STATUS_KEYS.has(value as UserStatus | "ALL")) {
    return value as UserStatus | "ALL";
  }
  return "ALL";
}

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

function userName(user: AdminUser): string {
  return (
    user.displayName ||
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    user.email
  );
}

export function UsersListPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const appliedStatus = parseStatus(searchParams.get("status"));
  const appliedQ = searchParams.get("q") ?? "";
  const appliedRole = searchParams.get("role") ?? "";
  const appliedCreatedFrom = searchParams.get("createdFrom") ?? "";
  const appliedCreatedTo = searchParams.get("createdTo") ?? "";
  const appliedUpdatedFrom = searchParams.get("updatedFrom") ?? "";
  const appliedUpdatedTo = searchParams.get("updatedTo") ?? "";
  const page = parsePage(searchParams.get("page"));
  const pageSize = parsePageSize(searchParams.get("take"));

  const appliedKey = [
    appliedQ,
    appliedCreatedFrom,
    appliedCreatedTo,
    appliedUpdatedFrom,
    appliedUpdatedTo,
  ].join("|");

  const [draftQ, setDraftQ] = useState(appliedQ);
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
  const [items, setItems] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<UserStatusCounts | null>(
    null,
  );
  const [roles, setRoles] = useState<Role[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // Sync draft fields when URL applied filters change (back/forward/clear).
  if (appliedKey !== syncedKey) {
    setSyncedKey(appliedKey);
    setDraftQ(appliedQ);
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

  function refreshList() {
    setReloadToken((n) => n + 1);
  }

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const result = await listAdminUsers({
          q: appliedQ || undefined,
          status: appliedStatus === "ALL" ? undefined : appliedStatus,
          role: appliedRole || undefined,
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
        if (result.statusCounts) setStatusCounts(result.statusCounts);
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
    appliedStatus,
    appliedRole,
    appliedCreatedFrom,
    appliedCreatedTo,
    appliedUpdatedFrom,
    appliedUpdatedTo,
    page,
    pageSize,
    reloadToken,
  ]);

  useEffect(() => {
    let cancelled = false;
    void listRoles()
      .then((r) => {
        if (!cancelled) setRoles(r);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  function applyFilters() {
    writeParams({
      q: draftQ.trim() || null,
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

  async function onArchive(id: string) {
    try {
      await archiveUser(id);
      setMessage("User archived.");
      refreshList();
    } catch {
      setError("Unable to archive user.");
    }
  }

  async function onRestore(id: string) {
    try {
      await restoreUser(id);
      setMessage("User restored.");
      refreshList();
    } catch {
      setError("Unable to restore user.");
    }
  }

  async function onDelete(id: string) {
    try {
      await deleteUser(id);
      setMessage("User deleted.");
      refreshList();
    } catch {
      setError("Unable to delete user. Last-admin safeguard may apply.");
    }
  }

  async function onSendReset(id: string) {
    try {
      await requestUserPasswordReset(id);
      setMessage("Password reset email sent.");
    } catch {
      setError("Unable to send password reset.");
    }
  }

  return (
    <ClinexaPage width="wide" className="gap-6">
      <PageBody>
        {message ? (
          <p className="text-sm text-success" role="status">
            {message}
          </p>
        ) : null}

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
                onClear={() => {
                  setDraftQ("");
                  if (appliedQ) writeParams({ q: null, page: "1" });
                }}
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
              <Button render={<Link href="/guardian/users/new" />}>
                Add user
              </Button>
            </div>
          </div>

          <CollapsibleFilterFields open={filtersOpen}>
            <div className={filterFieldsRowClassName}>
              <FilterControl label="Status" className={filterControlCompactClassName}>
                <AppSelect
                  value={appliedStatus}
                  onValueChange={(next) =>
                    writeParams({
                      status: next === "ALL" ? null : next,
                      page: "1",
                    })
                  }
                  aria-label="Filter by status"
                  options={STATUS_TABS.map((tab) => {
                    const count = statusCounts?.[tab.key];
                    return {
                      value: tab.key,
                      label:
                        count !== undefined
                          ? `${tab.label} (${count})`
                          : tab.label,
                    };
                  })}
                />
              </FilterControl>
              <FilterControl label="Role" className={filterControlCompactClassName}>
                <AppSelect
                  value={appliedRole}
                  onValueChange={(next) =>
                    writeParams({ role: next || null, page: "1" })
                  }
                  aria-label="Filter by role"
                  placeholder="All roles"
                  options={[
                    { value: "", label: "All roles" },
                    ...roles.map((role) => ({
                      value: role.code,
                      label: role.name,
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
              {appliedRole ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-9 shrink-0"
                  onClick={() => writeParams({ role: null, page: "1" })}
                >
                  Clear role
                </Button>
              ) : null}
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
              description="Try a different search, status, role, or date filter."
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
              <TableHead>Status</TableHead>
              <TableHead>2FA</TableHead>
              <TableHead>Created At</TableHead>
              <TableHead>Updated At</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((user) => {
              const editHref = `/guardian/users/${user.id}/edit`;
              const isArchived = user.status === "ARCHIVED";
              const isDeleted = user.status === "DELETED";
              const canRestore = isArchived || isDeleted;
              return (
                <TableRow
                  key={user.id}
                  className="group align-top"
                  onMouseEnter={() => setHoveredId(user.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <TableCell>
                    <div className="min-w-0">
                      <Link
                        href={editHref}
                        className="font-semibold text-primary hover:underline"
                      >
                        {userName(user)}
                      </Link>
                      <div
                        className={cn(
                          "mt-1 flex flex-wrap items-center gap-x-1 text-xs leading-relaxed text-primary transition-opacity",
                          hoveredId === user.id
                            ? "opacity-100"
                            : "opacity-0 group-hover:opacity-100",
                        )}
                      >
                        {canRestore ? (
                          <RequirePermission
                            permission={Permissions.ADM_RESTORE_USER}
                          >
                            <button
                              type="button"
                              className="hover:underline"
                              onClick={() => void onRestore(user.id)}
                            >
                              Restore
                            </button>
                            <span className="text-muted-foreground">|</span>
                          </RequirePermission>
                        ) : (
                          <RequirePermission
                            permission={Permissions.ADM_ARCHIVE_USER}
                          >
                            <button
                              type="button"
                              className="hover:underline"
                              onClick={() => void onArchive(user.id)}
                            >
                              Archive
                            </button>
                            <span className="text-muted-foreground">|</span>
                          </RequirePermission>
                        )}
                        {!isDeleted ? (
                          <RequirePermission
                            permission={Permissions.ADM_DELETE_USER}
                          >
                            <button
                              type="button"
                              className="text-destructive hover:underline"
                              onClick={() => void onDelete(user.id)}
                            >
                              Delete
                            </button>
                            <span className="text-muted-foreground">|</span>
                          </RequirePermission>
                        ) : null}
                        <button
                          type="button"
                          className="hover:underline"
                          onClick={() => void onSendReset(user.id)}
                        >
                          Send reset
                        </button>
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
                    <StatusBadge status={user.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">—</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(user.createdAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(user.updatedAt)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </DataTable>
      </PageBody>
    </ClinexaPage>
  );
}
