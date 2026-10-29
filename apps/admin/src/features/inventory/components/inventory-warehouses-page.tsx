"use client";

import { Inbox } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  ClinexaPage,
  DEFAULT_LIST_PAGE_SIZE,
  DataTable,
  EmptyState,
  ErrorState,
  FilterPanel,
  LIST_PAGE_SIZE_OPTIONS,
  ListPaginationBar,
  PageBody,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/patterns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePermissions } from "@/features/auth/hooks/use-permissions";
import { Permissions } from "@/features/auth/permissions";

import {
  createWarehouse,
  listWarehouses,
  updateWarehouse,
} from "../api/inventory-api";
import type { Warehouse } from "../types";
import { InventorySubnav } from "./inventory-subnav";

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

export function InventoryWarehousesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { can } = usePermissions();
  const canManage = can(Permissions.INV_MANAGE_WAREHOUSE);

  const page = parsePage(searchParams.get("page"));
  const pageSize = parsePageSize(searchParams.get("take"));

  const [items, setItems] = useState<Warehouse[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const pageItems = useMemo(() => {
    const start = page * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  function writeParams(patch: Record<string, string | null | undefined>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value == null || value === "") next.delete(key);
      else next.set(key, value);
    }
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const rows = await listWarehouses();
        if (cancelled) return;
        setItems(rows);
        setError(null);
      } catch {
        if (!cancelled) setError("Unable to load warehouses.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  async function reload() {
    setItems(await listWarehouses());
  }

  return (
    <ClinexaPage width="wide" className="gap-6">
      <PageBody>
        <InventorySubnav />

        {canManage ? (
          <FilterPanel>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="min-w-[10rem] flex-1 space-y-1.5">
                <span className="text-[0.65rem] font-medium tracking-[0.06em] text-muted-foreground uppercase">
                  Code
                </span>
                <Input
                  placeholder="Code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>
              <div className="min-w-[10rem] flex-1 space-y-1.5">
                <span className="text-[0.65rem] font-medium tracking-[0.06em] text-muted-foreground uppercase">
                  Name
                </span>
                <Input
                  placeholder="Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <Button
                type="button"
                onClick={() =>
                  void createWarehouse({ code, name })
                    .then(() => {
                      setCode("");
                      setName("");
                      return reload();
                    })
                    .catch(() => setError("Create failed."))
                }
              >
                Add warehouse
              </Button>
            </div>
          </FilterPanel>
        ) : null}

        <DataTable
          framed
          stickyFirstColumn
          loading={loading}
          empty={!loading && !error && pageItems.length === 0}
          emptyState={
            <EmptyState
              icon={<Inbox />}
              title="No warehouses"
              description="Create a warehouse to get started."
            />
          }
          error={
            error ? (
              <ErrorState title="Unable to load warehouses">
                {error}
              </ErrorState>
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
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageItems.map((w) => (
              <TableRow key={w.id}>
                <TableCell>
                  <span className="font-medium">{w.name}</span>
                  {w.isDefault ? (
                    <span className="ml-2 text-xs text-muted-foreground">
                      (default)
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {w.code}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {w.status}
                </TableCell>
                <TableCell>
                  {canManage && !w.isDefault ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void updateWarehouse(w.id, {
                          status:
                            w.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                        }).then(reload)
                      }
                    >
                      {w.status === "ACTIVE" ? "Deactivate" : "Activate"}
                    </Button>
                  ) : (
                    "—"
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </DataTable>
      </PageBody>
    </ClinexaPage>
  );
}
