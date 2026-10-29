import Link from "next/link";
import type { ReactNode } from "react";

import { ClinexaPage } from "@/components/patterns";
import { cn } from "@/lib/utils";

type AssetLibraryShellProps = {
  children: ReactNode;
  className?: string;
  /** Optional back link above the gallery header area. */
  backHref?: string;
  backLabel?: string;
};

/**
 * Distinct gallery chrome for Asset Library — atmospheric canvas, not FilterPanel lists.
 */
export function AssetLibraryShell({
  children,
  className,
  backHref,
  backLabel = "Asset Library",
}: AssetLibraryShellProps) {
  return (
    <ClinexaPage
      width="wide"
      className={cn("relative gap-0 overflow-hidden", className)}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-112 overflow-hidden"
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,oklch(0.55_0.08_230/0.14),transparent_55%),radial-gradient(ellipse_at_90%_10%,oklch(0.62_0.07_155/0.1),transparent_50%)] dark:bg-[radial-gradient(ellipse_at_20%_0%,oklch(0.55_0.1_230/0.22),transparent_55%),radial-gradient(ellipse_at_85%_5%,oklch(0.5_0.08_155/0.16),transparent_50%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,oklch(0.5_0.02_230/0.07)_1px,transparent_1px),linear-gradient(to_bottom,oklch(0.5_0.02_230/0.07)_1px,transparent_1px)] bg-size-[48px_48px] opacity-35 mask-[linear-gradient(to_bottom,black_0%,transparent_85%)] dark:opacity-25" />
      </div>

      {backHref ? (
        <Link
          href={backHref}
          className="mb-5 inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <span aria-hidden>←</span>
          {backLabel}
        </Link>
      ) : null}

      {children}
    </ClinexaPage>
  );
}

type AssetLibraryHeaderProps = {
  /** When omitted, the eyebrow becomes the page title. */
  title?: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: string;
  compact?: boolean;
  className?: string;
};

export function AssetLibraryHeader({
  title,
  description,
  actions,
  eyebrow = "Media vault",
  compact = false,
  className,
}: AssetLibraryHeaderProps) {
  const showTitle = Boolean(title?.trim());

  return (
    <header
      className={cn(
        "flex flex-col sm:flex-row sm:items-end sm:justify-between",
        compact ? "mb-4 gap-3 sm:mb-5 sm:gap-4" : "mb-8 gap-5 sm:mb-10",
        className,
      )}
    >
      <div className={cn("min-w-0", compact ? "space-y-1" : "space-y-2")}>
        {showTitle ? (
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-info">
            {eyebrow}
          </p>
        ) : (
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-info sm:text-3xl md:text-4xl">
            {eyebrow}
          </h1>
        )}
        {showTitle ? (
          <h1
            className={cn(
              "font-heading font-semibold tracking-tight text-foreground",
              compact
                ? "truncate text-xl sm:text-2xl"
                : "text-3xl sm:text-4xl",
            )}
          >
            {title}
          </h1>
        ) : null}
        {description ? (
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
