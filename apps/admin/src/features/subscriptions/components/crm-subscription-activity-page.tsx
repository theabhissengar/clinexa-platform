"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import {
  ClinexaPage,
  EntityDetailLeading,
  ErrorState,
  PageBody,
  PageHeader,
  PageHeaderCopy,
  PageHeaderDescription,
  PageHeaderTitle,
  PageSkeleton,
} from "@/components/patterns";
import { listCrmSubscriptionActivity } from "@/features/subscriptions/api/subscriptions-api";
import {
  formatDateTime,
  getErrorMessage,
} from "@/features/subscriptions/lib/format";
import type { SubscriptionActivity } from "@/features/subscriptions/types";

export function CrmSubscriptionActivityPage() {
  const params = useParams<{ id: string }>();
  const [rows, setRows] = useState<SubscriptionActivity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void listCrmSubscriptionActivity(params.id)
      .then(setRows)
      .catch((err) =>
        setError(getErrorMessage(err, "Unable to load activity.")),
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
          <PageHeaderTitle>Activity</PageHeaderTitle>
          <PageHeaderDescription>
            Operational events. Note bodies and platform audit are not stored
            here.
          </PageHeaderDescription>
        </PageHeaderCopy>
      </PageHeader>

      <PageBody>
        {loading ? (
          <PageSkeleton />
        ) : error ? (
          <ErrorState title="Unable to load activity">{error}</ErrorState>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity.</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {rows.map((row) => (
              <li key={row.id} className="border-b border-border pb-2">
                <div className="text-xs text-muted-foreground">
                  {formatDateTime(row.createdAt)} · {row.kind}
                </div>
                {row.summary}
              </li>
            ))}
          </ul>
        )}
      </PageBody>
    </ClinexaPage>
  );
}
