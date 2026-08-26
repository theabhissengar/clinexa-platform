"use client";

import { useEffect, useState } from "react";

import { getAdminPaymentProviders } from "@/features/payments/api/admin-payments-api";
import type { ProviderConfig } from "@/features/payments/types";

export function GuardianPaymentProvidersPage() {
  const [config, setConfig] = useState<ProviderConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const result = await getAdminPaymentProviders();
        if (!cancelled) setConfig(result);
      } catch {
        if (!cancelled) setError("Unable to load provider configuration.");
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-8 md:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        Payment providers
      </h1>
      <p className="text-sm text-muted-foreground">
        Read-only metadata. Secrets are never exposed.
      </p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {config ? (
        <dl className="grid gap-3 rounded-md border border-border p-4 text-sm">
          <div>
            <dt className="text-muted-foreground">Active provider</dt>
            <dd>{config.provider}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Mode</dt>
            <dd>{config.mode}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Capabilities</dt>
            <dd>{config.capabilities.join(", ")}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Webhook endpoint</dt>
            <dd className="font-mono text-xs">{config.webhookEndpointUrl}</dd>
          </div>
        </dl>
      ) : !error ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : null}
    </main>
  );
}
