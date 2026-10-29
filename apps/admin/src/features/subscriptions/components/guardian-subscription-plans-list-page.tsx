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
import { listAdminSubscriptionPlans } from "@/features/subscriptions/api/admin-subscription-plans-api";
import {
  formatMoneyCents,
  intervalLabel,
  statusLabel,
} from "@/features/subscriptions/lib/format";
import type {
  SubscriptionPlan,
  SubscriptionPlanStatus,
} from "@/features/subscriptions/types";

const STATUS_TABS: Array<{
  key: SubscriptionPlanStatus | "ALL";
  label: string;
}> = [
  { key: "ALL", label: "All" },
  { key: "DRAFT", label: "Draft" },
  { key: "PUBLISHED", label: "Published" },
  { key: "UNPUBLISHED", label: "Unpublished" },
  { key: "ARCHIVED", label: "Archived" },
];

const STATUS_KEYS = new Set(STATUS_TABS.map((tab) => tab.key));
const PAGE_SIZE_SET = new Set<number>(LIST_PAGE_SIZE_OPTIONS);

function parseStatus(value: string | null): SubscriptionPlanStatus | "ALL" {
  if (value && STATUS_KEYS.has(value as SubscriptionPlanStatus | "ALL")) {
    return value as SubscriptionPlanStatus | "ALL";
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

export function GuardianSubscriptionPlansListPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const appliedStatus = parseStatus(searchParams.get("status"));
  const appliedQ = searchParams.get("q") ?? "";
  const page = parsePage(searchParams.get("page"));
  const pageSize = parsePageSize(searchParams.get("take"));

  const [draftQ, setDraftQ] = useState(appliedQ);
  const [syncedQ, setSyncedQ] = useState(appliedQ);
  const [items, setItems] = useState<SubscriptionPlan[]>([]);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

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

  function applySearch() {
    writeParams({ q: draftQ.trim() || null, page: "1" });
  }

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      try {
        const result = await listAdminSubscriptionPlans({
          q: appliedQ || undefined,
          status: appliedStatus === "ALL" ? undefined : appliedStatus,
          skip: page * pageSize,
          take: pageSize,
        });
        if (cancelled) return;
        setItems(result.items);
        setTotal(result.total);
        setStatusCounts(result.statusCounts ?? {});
        setError(null);
      } catch {
        if (cancelled) return;
        setError("Unable to load plans.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [appliedQ, appliedStatus, page, pageSize]);

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
                placeholder="Search plans"
                className="w-full"
                aria-label="Search plans"
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
                onClick={() => applySearch()}
              >
                Apply
              </Button>
              <Button
                size="sm"
                render={<Link href="/guardian/subscriptions/plans/new" />}
              >
                Create plan
              </Button>
            </div>
          </div>

          <CollapsibleFilterFields open={filtersOpen}>
            <div className={filterFieldsRowClassName}>
              <FilterControl
                label="Status"
                className={filterControlCompactClassName}
              >
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
                    const count =
                      tab.key === "ALL"
                        ? statusCounts.ALL
                        : statusCounts[tab.key];
                    return {
                      value: tab.key,
                      label:
                        typeof count === "number"
                          ? `${tab.label} (${count})`
                          : tab.label,
                    };
                  })}
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
              title="No plans found"
              description="Try a different search or status filter."
            />
          }
          error={
            error ? (
              <ErrorState title="Unable to load plans">{error}</ErrorState>
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
              <TableHead>Plan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Interval</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((plan) => (
              <ClickableTableRow
                href={`/guardian/subscriptions/plans/${plan.id}/edit`}
                key={plan.id}
              >
                <TableCell>
                  <div className="font-medium">{plan.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {plan.slug}
                  </div>
                </TableCell>
                <TableCell>{statusLabel(plan.lifecycleStatus)}</TableCell>
                <TableCell>
                  {intervalLabel(plan.billingInterval, plan.intervalCount)}
                </TableCell>
                <TableCell>
                  {formatMoneyCents(plan.priceCents, plan.currency)}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/guardian/subscriptions/plans/${plan.id}/edit`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    Edit
                  </Link>
                </TableCell>
              </ClickableTableRow>
            ))}
          </TableBody>
        </DataTable>
      </PageBody>
    </ClinexaPage>
  );
}
