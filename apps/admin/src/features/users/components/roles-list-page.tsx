"use client";

import { Inbox } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  ClickableTableRow,
  ClinexaPage,
  DEFAULT_LIST_PAGE_SIZE,
  DataTable,
  EmptyState,
  ErrorState,
  LIST_PAGE_SIZE_OPTIONS,
  ListPaginationBar,
  PageBody,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/patterns";
import { listRoles } from "@/features/users/api/users-api";
import type { Role } from "@/features/users/types";

const PAGE_SIZE_SET = new Set<number>(LIST_PAGE_SIZE_OPTIONS);

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

export function RolesListPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const page = parsePage(searchParams.get("page"));
  const pageSize = parsePageSize(searchParams.get("take"));

  const [roles, setRoles] = useState<Role[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void listRoles()
      .then(setRoles)
      .catch(() => setError("Unable to load roles."))
      .finally(() => setLoading(false));
  }, []);

  const total = roles.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const items = useMemo(() => {
    const start = page * pageSize;
    return roles.slice(start, start + pageSize);
  }, [roles, page, pageSize]);

  function writeParams(patch: Record<string, string | null | undefined>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value == null || value === "") next.delete(key);
      else next.set(key, value);
    }
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <ClinexaPage width="wide" className="gap-6">
      <PageBody>
        <DataTable
          framed
          stickyFirstColumn
          loading={loading}
          empty={!loading && !error && items.length === 0}
          emptyState={
            <EmptyState
              icon={<Inbox />}
              title="No roles found"
              description="Fixed platform roles will appear here."
            />
          }
          error={
            error ? (
              <ErrorState title="Unable to load roles">{error}</ErrorState>
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
              <TableHead>Code</TableHead>
              <TableHead>Permissions</TableHead>
              <TableHead>Users</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((role) => (
              <ClickableTableRow
                href={`/guardian/roles/${role.id}/edit`}
                key={role.id}
              >
                <TableCell>
                  <Link
                    href={`/guardian/roles/${role.id}/edit`}
                    className="font-semibold text-primary hover:underline"
                  >
                    {role.name}
                  </Link>
                  {role.description ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {role.description}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {role.code}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {role.permissionCodes.length}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {role.assignedUserCount}
                </TableCell>
              </ClickableTableRow>
            ))}
          </TableBody>
        </DataTable>
      </PageBody>
    </ClinexaPage>
  );
}
