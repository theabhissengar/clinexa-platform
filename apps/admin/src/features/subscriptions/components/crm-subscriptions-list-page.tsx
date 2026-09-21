"use client";

import { Inbox } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import {
  ClearableSearchInput,
  ClinexaPage,
  DataTable,
  EmptyState,
  ErrorState,
  FilterBar,
  FilterBarGroup,
  FilterBarRow,
  ListPaginationBar,
  PageBody,
  PageHeader,
  PageHeaderCopy,
  PageHeaderDescription,
  PageHeaderTitle,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
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
const PAGE_SIZE = 20;

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

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
          skip: page * PAGE_SIZE,
          take: PAGE_SIZE,
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
      <PageHeader>
        <PageHeaderCopy>
          <PageHeaderTitle>Subscriptions</PageHeaderTitle>
          <PageHeaderDescription>
            Operational subscription assist. Create, delete, archive, restore,
            corrections, and overrides are Guardian-only.
          </PageHeaderDescription>
        </PageHeaderCopy>
      </PageHeader>

      <PageBody>
        <FilterBar>
          <FilterBarRow>
            <FilterBarGroup className="flex-wrap gap-x-3 gap-y-1 text-sm">
              {STATUS_TABS.map((tab, index) => {
                const active = appliedStatus === tab.key;
                const count =
                  tab.key === "ALL" ? statusCounts.ALL : statusCounts[tab.key];
                return (
                  <span
                    key={tab.key}
                    className="inline-flex items-center gap-3"
                  >
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
                      {typeof count === "number" ? (
                        <span className="ml-1 text-muted-foreground">
                          ({count})
                        </span>
                      ) : null}
                    </button>
                  </span>
                );
              })}
            </FilterBarGroup>
            <FilterBarGroup>
              <form
                className="flex flex-wrap gap-2"
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
                  className="w-52"
                  aria-label="Search subscriptions"
                />
                <Button type="submit" size="sm" variant="outline">
                  Search
                </Button>
              </form>
            </FilterBarGroup>
          </FilterBarRow>
          <FilterBarRow>
            <FilterBarGroup className="flex flex-wrap items-end gap-3 text-sm">
              <label className="flex flex-col gap-1">
                <span className="text-muted-foreground">Plan</span>
                <select
                  className="h-9 rounded-lg border border-input bg-background px-2"
                  value={appliedPlan}
                  onChange={(event) =>
                    writeParams({
                      planId: event.target.value || null,
                      page: "1",
                    })
                  }
                >
                  <option value="">All plans</option>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-muted-foreground">Next renewal from</span>
                <input
                  type="date"
                  className="h-9 rounded-lg border border-input bg-background px-2"
                  value={appliedFrom.slice(0, 10)}
                  onChange={(event) =>
                    writeParams({
                      nextRenewalFrom: event.target.value
                        ? new Date(event.target.value).toISOString()
                        : null,
                      page: "1",
                    })
                  }
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-muted-foreground">Next renewal to</span>
                <input
                  type="date"
                  className="h-9 rounded-lg border border-input bg-background px-2"
                  value={appliedTo.slice(0, 10)}
                  onChange={(event) =>
                    writeParams({
                      nextRenewalTo: event.target.value
                        ? new Date(
                            `${event.target.value}T23:59:59.999Z`,
                          ).toISOString()
                        : null,
                      page: "1",
                    })
                  }
                />
              </label>
              {hasFilters ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setDraftQ("");
                    router.push(pathname);
                  }}
                >
                  Clear filters
                </Button>
              ) : null}
            </FilterBarGroup>
          </FilterBarRow>
        </FilterBar>

        <DataTable
          stickyFirstColumn
          density="dense"
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
              <TableHead>Cycle</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Clinical</TableHead>
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
                <TableRow key={row.id} className="align-top">
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
                  <TableCell className="tabular-nums">{row.cycleNumber}</TableCell>
                  <TableCell>{row.paymentStatusSummary ?? "—"}</TableCell>
                  <TableCell>
                    <StatusBadge status={row.clinicalRequirement} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(row.createdAt)}
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
