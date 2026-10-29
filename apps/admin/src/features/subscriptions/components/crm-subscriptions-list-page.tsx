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
  DataTable,
  DateField,
  EmptyState,
  ErrorState,
  FilterControl,
  FilterFieldsToggle,
  FilterPanel,
  DEFAULT_LIST_PAGE_SIZE,
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
import { StatusBadge } from "@/components/ui/status-badge";
import { listCrmSubscriptions } from "@/features/subscriptions/api/subscriptions-api";
import {
  customerLabel,
  formatDateTime,
} from "@/features/subscriptions/lib/format";
import type {
  SubscriptionListItem,
  SubscriptionStatus,
} from "@/features/subscriptions/types";

const STATUS_TABS: Array<{ key: SubscriptionStatus | "ALL"; label: string }> = [
  { key: "ALL", label: "All" },
  { key: "PENDING_SETUP", label: "Pending setup" },
  { key: "ACTIVE", label: "Active" },
  { key: "PAUSED", label: "On Hold" },
  { key: "PAST_DUE", label: "Past due" },
  { key: "CANCELLED", label: "Cancelled" },
  { key: "EXPIRED", label: "Expired" },
  { key: "COMPLETED", label: "Completed" },
];

const STATUS_KEYS = new Set(STATUS_TABS.map((tab) => tab.key));
const PAGE_SIZE_SET = new Set<number>(LIST_PAGE_SIZE_OPTIONS);

function parseStatus(value: string | null): SubscriptionStatus | "ALL" {
  if (value && STATUS_KEYS.has(value as SubscriptionStatus | "ALL")) {
    return value as SubscriptionStatus | "ALL";
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

export function CrmSubscriptionsListPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const appliedStatus = parseStatus(searchParams.get("status"));
  const appliedQ = searchParams.get("q") ?? "";
  const appliedPlan = searchParams.get("planId") ?? "";
  const appliedPatient = searchParams.get("patientUserId") ?? "";
  const appliedFrom = searchParams.get("nextRenewalFrom") ?? "";
  const appliedTo = searchParams.get("nextRenewalTo") ?? "";
  const page = parsePage(searchParams.get("page"));
  const pageSize = parsePageSize(searchParams.get("take"));

  const [draftQ, setDraftQ] = useState(appliedQ);
  const [syncedQ, setSyncedQ] = useState(appliedQ);
  const [items, setItems] = useState<SubscriptionListItem[]>([]);
  const [plans, setPlans] = useState<
    Array<{ id: string; name: string; lifecycleStatus: string }>
  >([]);
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

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      try {
        const result = await listCrmSubscriptions({
          q: appliedQ || undefined,
          status: appliedStatus === "ALL" ? undefined : appliedStatus,
          planId: appliedPlan || undefined,
          patientUserId: appliedPatient || undefined,
          nextRenewalFrom: appliedFrom || undefined,
          nextRenewalTo: appliedTo || undefined,
          skip: page * pageSize,
          take: pageSize,
        });
        if (cancelled) return;
        setItems(result.items);
        setTotal(result.total);
        setStatusCounts(result.statusCounts ?? {});
        setPlans(result.plans ?? []);
        setError(null);
      } catch {
        if (cancelled) return;
        setError("Unable to load subscriptions.");
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
    appliedPlan,
    appliedPatient,
    appliedFrom,
    appliedTo,
    page,
    pageSize,
  ]);

  const hasFilters =
    Boolean(appliedQ) ||
    appliedStatus !== "ALL" ||
    Boolean(appliedPlan) ||
    Boolean(appliedPatient) ||
    Boolean(appliedFrom) ||
    Boolean(appliedTo);

  function applySearch() {
    writeParams({ q: draftQ.trim() || null, page: "1" });
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
                placeholder="Search subscriptions"
                className="w-full"
                aria-label="Search subscriptions"
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
            </div>
          </div>

          <CollapsibleFilterFields open={filtersOpen}>
            <div className="flex flex-col gap-3">
              {hasFilters ? (
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    onClick={() => {
                      setDraftQ("");
                      router.push(pathname);
                    }}
                  >
                    Clear filters
                  </Button>
                </div>
              ) : null}
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
                <FilterControl
                  label="Plan"
                  className={filterControlCompactClassName}
                >
                  <AppSelect
                    value={appliedPlan}
                    onValueChange={(next) =>
                      writeParams({
                        planId: next || null,
                        page: "1",
                      })
                    }
                    aria-label="Filter by plan"
                    placeholder="All plans"
                    options={[
                      { value: "", label: "All plans" },
                      ...plans.map((plan) => ({
                        value: plan.id,
                        label: plan.name,
                      })),
                    ]}
                  />
                </FilterControl>
                <FilterControl
                  label="Next renewal from"
                  className={filterControlCompactClassName}
                >
                  <DateField
                    value={appliedFrom.slice(0, 10)}
                    onChange={(day) =>
                      writeParams({
                        nextRenewalFrom: day
                          ? new Date(day).toISOString()
                          : null,
                        page: "1",
                      })
                    }
                    aria-label="Next renewal from"
                  />
                </FilterControl>
                <FilterControl
                  label="Next renewal to"
                  className={filterControlCompactClassName}
                >
                  <DateField
                    value={appliedTo.slice(0, 10)}
                    onChange={(day) =>
                      writeParams({
                        nextRenewalTo: day
                          ? new Date(`${day}T23:59:59.999Z`).toISOString()
                          : null,
                        page: "1",
                      })
                    }
                    aria-label="Next renewal to"
                  />
                </FilterControl>
                {appliedPatient ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-9 shrink-0"
                    onClick={() =>
                      writeParams({ patientUserId: null, page: "1" })
                    }
                  >
                    Clear patient filter
                  </Button>
                ) : null}
              </div>
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
              title="No subscriptions found"
              description="Try a different search or status filter."
            />
          }
          error={
            error ? (
              <ErrorState title="Unable to load subscriptions">
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
              <TableHead>Subscription</TableHead>
              <TableHead>Patient</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Period / renewal</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((row) => {
              const href = `/crm/subscriptions/${row.id}${
                searchParams.toString()
                  ? `?return=${encodeURIComponent(`?${searchParams.toString()}`)}`
                  : ""
              }`;
              return (
                <ClickableTableRow href={href} key={row.id} className="align-top">
                  <TableCell>
                    <Link
                      href={href}
                      className="font-semibold text-primary hover:underline"
                    >
                      {row.subscriptionNumber ?? row.id.slice(0, 8)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div>{customerLabel(row)}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.customerEmail ?? "—"}
                    </div>
                  </TableCell>
                  <TableCell>{row.plan?.name ?? "—"}</TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell>
                    <div>{formatDateTime(row.currentPeriodEnd)}</div>
                    <div className="text-xs text-muted-foreground">
                      Next {formatDateTime(row.nextRenewalAt)}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(row.createdAt)}
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
