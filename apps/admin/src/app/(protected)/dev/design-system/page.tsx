"use client";

import { Inbox, Package } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  ClearableSearchInput,
  ClinexaPage,
  ConfirmDialog,
  DataTable,
  DetailSection,
  EmptyState,
  EntityDetailHeader,
  EntityDetailLeading,
  ErrorState,
  FieldGrid,
  FilterBar,
  FilterBarGroup,
  FilterBarRow,
  FormSection,
  ListPaginationBar,
  MetricCard,
  ModuleDetailSearch,
  PageBody,
  PageCanvas,
  PageHeader,
  PageHeaderActions,
  PageHeaderCopy,
  PageHeaderDescription,
  PageHeaderMeta,
  PageHeaderTitle,
  PageSkeleton,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeleton,
} from "@/components/patterns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  STATUS_TONE_EXAMPLES,
  assertStatusSemantics,
  resolveStatusSemantics,
} from "@/lib/status-semantics";

const UNKNOWN_STATUS = "NOT_A_REAL_STATUS";

const SAMPLE_ROWS = [
  { id: "ORD-1001", customer: "Ada Lovelace", status: "ACTIVE", total: "$128.00" },
  { id: "ORD-1002", customer: "Alan Turing", status: "PAYMENT_PENDING", total: "$64.00" },
  { id: "ORD-1003", customer: "Grace Hopper", status: "PAUSED", total: "$96.00" },
  { id: "ORD-1004", customer: "Katherine Johnson", status: "CANCELLED", total: "$32.00" },
] as const;

type TablePreview = "rows" | "loading" | "empty" | "error";

/**
 * Unlisted design-system verification surface (Phase 5A / 5C).
 * Not in nav-config. Do not treat as a product feature.
 */
export default function DesignSystemPreviewPage() {
  const errors = useMemo(() => assertStatusSemantics(), []);
  const unknown = resolveStatusSemantics(UNKNOWN_STATUS);
  const [search, setSearch] = useState("");
  const [tablePreview, setTablePreview] = useState<TablePreview>("rows");
  const [page, setPage] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [buttonLoading, setButtonLoading] = useState(false);

  const searchFn = useCallback(async (query: string) => {
    await new Promise((resolve) => window.setTimeout(resolve, 200));
    return SAMPLE_ROWS.filter((row) =>
      `${row.id} ${row.customer}`.toLowerCase().includes(query.toLowerCase()),
    ).map((row) => ({
      id: row.id,
      label: row.id,
      sublabel: row.customer,
    }));
  }, []);

  return (
    <ClinexaPage width="wide" className="gap-8">
      <PageHeader>
        <PageHeaderCopy>
          <PageHeaderTitle>Design system preview</PageHeaderTitle>
          <PageHeaderDescription>
            Development verification for Phase 5A tokens and Phase 5C shared
            patterns. Not a product destination. Feature screens are not
            migrated here.
          </PageHeaderDescription>
        </PageHeaderCopy>
      </PageHeader>

      {errors.length > 0 ? (
        <p className="text-sm text-destructive" role="alert">
          Status registry checks failed: {errors.join("; ")}
        </p>
      ) : (
        <p className="text-sm text-success">
          Status registry checks passed. Every tone has a visible text label.
        </p>
      )}

      <PageBody>
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-h2 font-semibold">
            Dashboard canvas and metrics
          </h2>
          <PageCanvas className="rounded-xl p-4 ring-1 ring-foreground/10">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                label="Operational queue"
                value={24}
                hint="Real values are supplied by feature pages"
                icon={<Package />}
              />
              <MetricCard
                label="Needs attention"
                value={3}
                hint="Semantic warning treatment"
                tone="warning"
                icon={<Inbox />}
              />
              <MetricCard label="Loading metric" loading />
            </div>
          </PageCanvas>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-h2 font-semibold">StatusBadge tones</h2>
          <ul className="flex flex-col gap-2">
            {STATUS_TONE_EXAMPLES.map((example) => {
              const semantics = resolveStatusSemantics(example.status);
              return (
                <li
                  key={example.status}
                  className="flex flex-wrap items-center gap-3 text-sm"
                >
                  <StatusBadge status={example.status} />
                  <span className="min-w-0 break-words text-muted-foreground">
                    {example.tone} · {semantics.value} · {semantics.label}
                  </span>
                </li>
              );
            })}
            <li className="flex flex-wrap items-center gap-3 text-sm">
              <StatusBadge status={UNKNOWN_STATUS} />
              <span className="min-w-0 break-words text-muted-foreground">
                unknown fallback · original {unknown.value} · {unknown.label}
              </span>
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-h2 font-semibold">Focus samples</h2>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button">Primary action</Button>
            <Button type="button" variant="outline">
              Outline
            </Button>
            <Input
              aria-label="Focus sample"
              placeholder="Focus this input"
              className="max-w-xs"
            />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-h2 font-semibold">PageHeader</h2>
          <PageHeader>
            <PageHeaderCopy>
              <PageHeaderTitle>Catalog list</PageHeaderTitle>
              <PageHeaderDescription>
                Shared header for Guardian and CRM screens. Actions wrap on
                narrow widths.
              </PageHeaderDescription>
              <PageHeaderMeta>
                <StatusBadge status="ACTIVE" />
                <span className="text-caption text-muted-foreground">
                  Mock metadata
                </span>
              </PageHeaderMeta>
            </PageHeaderCopy>
            <PageHeaderActions>
              <Button type="button" variant="outline">
                Secondary
              </Button>
              <Button type="button">Primary</Button>
            </PageHeaderActions>
          </PageHeader>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-h2 font-semibold">
            EntityDetailHeader
          </h2>
          <EntityDetailHeader
            leading={
              <EntityDetailLeading>
                <button
                  type="button"
                  className="text-muted-foreground underline-offset-4 hover:underline"
                >
                  Back to list
                </button>
              </EntityDetailLeading>
            }
            title="ORD-1001"
            identifier="id_sample_0001"
            status={<StatusBadge status="AWAITING_FULFILLMENT" />}
            metadata={
              <span className="text-caption text-muted-foreground">
                Created 2026-09-20
              </span>
            }
            actions={
              <>
                <Button type="button" size="sm" variant="outline">
                  Edit
                </Button>
                <Button type="button" size="sm" variant="destructive">
                  Archive
                </Button>
              </>
            }
          />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-h2 font-semibold">FilterBar</h2>
          <FilterBar>
            <FilterBarRow>
              <FilterBarGroup>
                <ClearableSearchInput
                  value={search}
                  onChange={setSearch}
                  onClear={() => setSearch("")}
                  placeholder="Search sample rows"
                  aria-label="Search sample rows"
                  className="w-52"
                />
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted-foreground">Status</span>
                  <select
                    className="h-8 rounded-lg border border-input bg-background px-2"
                    defaultValue="ALL"
                    aria-label="Sample status filter"
                  >
                    <option value="ALL">All</option>
                    <option value="ACTIVE">Active</option>
                  </select>
                </label>
              </FilterBarGroup>
              <FilterBarGroup>
                <Button type="button" size="sm" variant="outline">
                  Reset
                </Button>
              </FilterBarGroup>
            </FilterBarRow>
          </FilterBar>
          <ModuleDetailSearch
            placeholder="Type at least 2 letters…"
            searchFn={searchFn}
            onSelect={() => undefined}
          />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-h2 font-semibold">DataTable</h2>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["rows", "Rows"],
                ["loading", "Loading"],
                ["empty", "Empty"],
                ["error", "Error"],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={tablePreview === value ? "default" : "outline"}
                onClick={() => setTablePreview(value)}
              >
                {label}
              </Button>
            ))}
          </div>
          <DataTable
            caption="Sample catalog"
            stickyFirstColumn
            loading={tablePreview === "loading"}
            empty={tablePreview === "empty"}
            emptyState={
              <EmptyState
                icon={<Inbox />}
                title="No sample rows"
                description="Informational empty state with no required action."
              />
            }
            error={
              tablePreview === "error" ? (
                <ErrorState
                  title="Unable to load sample rows"
                  onRetry={() => setTablePreview("rows")}
                >
                  Mock query failure for pattern verification. Retry is a
                  callback only.
                </ErrorState>
              ) : undefined
            }
            footer={
              <ListPaginationBar
                total={SAMPLE_ROWS.length}
                page={page}
                pageCount={2}
                onPrev={() => setPage((current) => Math.max(0, current - 1))}
                onNext={() => setPage((current) => Math.min(1, current + 1))}
              />
            }
          >
            <TableHeader>
              <TableRow>
                <TableHead>Record</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {SAMPLE_ROWS.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.id}</TableCell>
                  <TableCell>{row.customer}</TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell>{row.total}</TableCell>
                  <TableCell>Verification copy</TableCell>
                  <TableCell>2026-09-20</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </DataTable>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-h2 font-semibold">EmptyState</h2>
          <EmptyState
            icon={<Package />}
            title="Nothing to show"
            description="Optional actions may be composed by the caller."
          >
            <Button type="button" size="sm">
              Optional action
            </Button>
            <Button type="button" size="sm" variant="outline">
              Secondary
            </Button>
          </EmptyState>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-h2 font-semibold">ErrorState</h2>
          <ErrorState title="Sample list failed" onRetry={() => undefined}>
            Blocking failures stay inline. Recoverable feedback can also use a
            toast.
          </ErrorState>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-h2 font-semibold">PageSkeleton</h2>
          <PageSkeleton />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-h2 font-semibold">TableSkeleton</h2>
          <TableSkeleton rows={4} columns={4} />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-h2 font-semibold">ConfirmDialog</h2>
          <Button type="button" variant="destructive" onClick={() => setConfirmOpen(true)}>
            Open confirm dialog
          </Button>
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title="Archive this sample record?"
            description="Destructive confirmation pattern. Feature pages still use window.confirm until 5E/5F."
            confirmLabel="Archive"
            destructive
            loading={confirmLoading}
            onConfirm={async () => {
              setConfirmLoading(true);
              await new Promise((resolve) => window.setTimeout(resolve, 600));
              setConfirmLoading(false);
            }}
          />
        </section>

        <FormSection
          title="FormSection"
          description="Layout only. Existing React Hook Form and Zod remain the form stack."
        >
          <FieldGrid columns={2}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sample-name">Name</Label>
              <Input id="sample-name" defaultValue="Ada Lovelace" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sample-email">Email</Label>
              <Input
                id="sample-email"
                type="email"
                defaultValue="ada@example.com"
              />
            </div>
          </FieldGrid>
        </FormSection>

        <DetailSection
          title="DetailSection"
          description="Reusable section for later detail-page assembly."
          actions={
            <Button type="button" size="sm" variant="outline">
              Section action
            </Button>
          }
        >
          <p className="text-body text-muted-foreground">
            Domain fields stay in feature pages. This pattern only provides
            spacing, heading, and an optional action area.
          </p>
        </DetailSection>

        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-h2 font-semibold">
            Button loading and toast
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              loading={buttonLoading}
              onClick={() => {
                setButtonLoading(true);
                window.setTimeout(() => setButtonLoading(false), 800);
              }}
            >
              Save sample
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => toast.success("Sample saved")}
            >
              Success toast
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => toast.error("Recoverable failure")}
            >
              Error toast
            </Button>
          </div>
          <p className="text-caption text-muted-foreground">
            Convention: success → toast; recoverable failure → toast and/or
            inline; blocking validation or API errors → inline. Existing
            mutations are not wired in 5C.
          </p>
        </section>
      </PageBody>
    </ClinexaPage>
  );
}
