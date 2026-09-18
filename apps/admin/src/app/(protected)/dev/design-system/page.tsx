"use client";

import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  STATUS_TONE_EXAMPLES,
  assertStatusSemantics,
  resolveStatusSemantics,
} from "@/lib/status-semantics";

const UNKNOWN_STATUS = "NOT_A_REAL_STATUS";

/**
 * Unlisted design-system verification surface (Phase 5A).
 * Not in nav-config. Do not treat as a product feature.
 */
export default function DesignSystemPreviewPage() {
  const errors = useMemo(() => assertStatusSemantics(), []);
  const unknown = resolveStatusSemantics(UNKNOWN_STATUS);

  return (
    <main className="mx-auto flex w-full max-w-3xl min-w-0 flex-1 flex-col gap-8 px-4 py-6 md:px-6 md:py-8 lg:max-w-4xl">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">
          Design system preview
        </h1>
        <p className="text-sm text-muted-foreground">
          Phase 5A verification only. StatusBadge is not wired into CRM or
          Guardian feature screens.
        </p>
      </header>

      {errors.length > 0 ? (
        <p className="text-sm text-destructive" role="alert">
          Status registry checks failed: {errors.join("; ")}
        </p>
      ) : (
        <p className="text-sm text-success">
          Status registry checks passed. Every tone has a visible text label.
        </p>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">StatusBadge tones</h2>
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
        <h2 className="text-sm font-semibold">Focus samples</h2>
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
    </main>
  );
}
