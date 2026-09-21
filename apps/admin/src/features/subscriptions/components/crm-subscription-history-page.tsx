"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import {
  ClinexaPage,
  DetailSection,
  EntityDetailLeading,
  ErrorState,
  PageBody,
  PageHeader,
  PageHeaderCopy,
  PageHeaderDescription,
  PageHeaderTitle,
  PageSkeleton,
} from "@/components/patterns";
import { StatusBadge } from "@/components/ui/status-badge";
import { listCrmSubscriptionHistory } from "@/features/subscriptions/api/subscriptions-api";
import {
  formatDateTime,
  getErrorMessage,
} from "@/features/subscriptions/lib/format";
import type { SubscriptionHistoryResponse } from "@/features/subscriptions/types";

export function CrmSubscriptionHistoryPage() {
  const params = useParams<{ id: string }>();
  const [history, setHistory] = useState<SubscriptionHistoryResponse | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void listCrmSubscriptionHistory(params.id)
      .then(setHistory)
      .catch((err) =>
        setError(getErrorMessage(err, "Unable to load history.")),
      )
      .finally(() => setLoading(false));
  }, [params.id]);

  return (
    <ClinexaPage width="standard" className="gap-6">
      <PageHeader>
        <PageHeaderCopy>
          <EntityDetailLeading>
            <Link
              href={`/crm/subscriptions/${params.id}`}
              className="underline-offset-4 hover:underline"
            >
              ← Subscription
            </Link>
          </EntityDetailLeading>
          <PageHeaderTitle>History</PageHeaderTitle>
          <PageHeaderDescription>
            Lifecycle transitions and field changes. This is not the platform
            audit log.
          </PageHeaderDescription>
        </PageHeaderCopy>
      </PageHeader>

      <PageBody>
        {loading ? (
          <PageSkeleton />
        ) : error ? (
          <ErrorState title="Unable to load history">{error}</ErrorState>
        ) : (
          <>
            <DetailSection title="Status history">
              <ul className="space-y-2 text-sm">
                {(history?.status ?? []).map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <span className="text-muted-foreground">
                      {formatDateTime(row.createdAt)}
                    </span>
                    {row.fromStatus ? (
                      <StatusBadge status={row.fromStatus} />
                    ) : (
                      <span>—</span>
                    )}
                    <span className="text-muted-foreground">→</span>
                    <StatusBadge status={row.toStatus} />
                    <span className="text-muted-foreground">
                      ({row.source}
                      {row.reason ? ` · ${row.reason}` : ""})
                    </span>
                  </li>
                ))}
                {(history?.status ?? []).length === 0 ? (
                  <li className="text-muted-foreground">No status history.</li>
                ) : null}
              </ul>
            </DetailSection>
            <DetailSection title="Change history">
              <ul className="space-y-2 text-sm">
                {(history?.changes ?? []).map((row) => (
                  <li key={row.id}>
                    {formatDateTime(row.createdAt)} · {row.action}
                  </li>
                ))}
                {(history?.changes ?? []).length === 0 ? (
                  <li className="text-muted-foreground">No field changes.</li>
                ) : null}
              </ul>
            </DetailSection>
          </>
        )}
      </PageBody>
    </ClinexaPage>
  );
}
