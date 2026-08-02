"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { RequirePermission } from "@/components/auth/require-permission";
import { ClearableSearchInput } from "@/features/products/components/clearable-search-input";
import { ListPaginationBar } from "@/features/products/components/list-pagination-bar";
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
const PAGE_SIZE = 20;

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
  const page = parsePage(searchParams.get("page"));

  const [draftQ, setDraftQ] = useState(appliedQ);
  const [syncedQ, setSyncedQ] = useState(appliedQ);
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

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Sync the draft search box when the URL applied filter changes (back/forward/clear).
  if (appliedQ !== syncedQ) {
    setSyncedQ(appliedQ);
    setDraftQ(appliedQ);
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
          skip: page * PAGE_SIZE,
          take: PAGE_SIZE,
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
  }, [appliedQ, appliedStatus, appliedRole, page, reloadToken]);

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

  function applySearch() {
    writeParams({ q: draftQ.trim() || null, page: "1" });
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
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Administrative user lifecycle. Destructive actions are Class D
            gated and never appear in CRM.
          </p>
        </div>
        <Button render={<Link href="/guardian/users/new" />}>Add user</Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2 text-sm">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {STATUS_TABS.map((tab, index) => {
            const count = statusCounts?.[tab.key];
            const active = appliedStatus === tab.key;
            return (
              <span key={tab.key} className="inline-flex items-center gap-3">
                {index > 0 ? (
                  <span className="text-muted-foreground/40">|</span>
                ) : null}
                <button
                  type="button"
                  onClick={() =>
                    writeParams({
                      status: tab.key === "ALL" ? null : tab.key,
                      page: "1",
                    })
                  }
                  className={
                    active
                      ? "font-medium text-foreground"
                      : "text-primary hover:underline"
                  }
                >
                  {tab.label}
                  {count !== undefined ? (
                    <span className="text-muted-foreground"> ({count})</span>
                  ) : null}
                </button>
              </span>
            );
          })}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            applySearch();
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
            className="w-52"
            aria-label="Search users"
          />
          <Button type="submit" size="sm" variant="outline">
            Search users
          </Button>
        </form>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-8 rounded-md border border-border bg-background px-2 text-sm"
          value={appliedRole}
          onChange={(e) =>
            writeParams({ role: e.target.value || null, page: "1" })
          }
          aria-label="Filter by role"
        >
          <option value="">All roles</option>
          {roles.map((role) => (
            <option key={role.code} value={role.code}>
              {role.name}
            </option>
          ))}
        </select>
        {appliedRole ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => writeParams({ role: null, page: "1" })}
          >
            Clear role filter
          </Button>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {message ? (
        <p className="text-sm text-emerald-600">{message}</p>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-240 text-left text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Roles</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">2FA</th>
                <th className="px-3 py-2 font-medium">Registered</th>
              </tr>
            </thead>
            <tbody>
              {items.map((user) => {
                const editHref = `/guardian/users/${user.id}/edit`;
                const isArchived = user.status === "ARCHIVED";
                const isDeleted = user.status === "DELETED";
                const canRestore = isArchived || isDeleted;
                return (
                  <tr
                    key={user.id}
                    className="group border-t border-border align-top hover:bg-muted/20"
                    onMouseEnter={() => setHoveredId(user.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    <td className="px-3 py-3">
                      <Link
                        href={editHref}
                        className="font-semibold text-primary hover:underline"
                      >
                        {userName(user)}
                      </Link>
                      <div
                        className={`mt-1 flex flex-wrap items-center gap-x-1 text-xs leading-relaxed text-primary transition-opacity ${
                          hoveredId === user.id
                            ? "opacity-100"
                            : "opacity-0 group-hover:opacity-100"
                        }`}
                      >
                        <Link href={editHref} className="hover:underline">
                          Edit
                        </Link>
                        <span className="text-muted-foreground">|</span>
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
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {user.email}
                    </td>
                    <td className="px-3 py-3">
                      {user.roles.length
                        ? user.roles.map((r) => r.name).join(", ")
                        : "—"}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      <span className="capitalize">
                        {user.status.replace(/_/g, " ").toLowerCase()}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">—</td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {formatDate(user.createdAt)}
                    </td>
                  </tr>
                );
              })}
              {!items.length ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    No users found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      <ListPaginationBar
        total={total}
        page={page}
        pageCount={pageCount}
        onPrev={() => writeParams({ page: page <= 0 ? null : String(page) })}
        onNext={() =>
          writeParams({ page: String(Math.min(pageCount, page + 2)) })
        }
      />
    </main>
  );
}
