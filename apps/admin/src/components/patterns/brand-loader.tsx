"use client";

import { BrandMark } from "@/components/layout/brand-mark";
import { cn } from "@/lib/utils";

type BrandLoaderProps = {
  /** Accessible status text (also shown under the mark for page/overlay). */
  label?: string;
  /**
   * - page: full viewport wait (session restore, login)
   * - overlay: covers shell content during CRM↔Guardian switch
   * - inline: compact row for local waits
   */
  variant?: "page" | "overlay" | "inline";
  className?: string;
};

/**
 * Clinexa branded wait indicator — cream / charcoal / gold.
 * Use only while something is actually pending (session, switch, data).
 */
export function BrandLoader({
  label = "Loading…",
  variant = "page",
  className,
}: BrandLoaderProps) {
  if (variant === "inline") {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        className={cn(
          "inline-flex items-center gap-2.5 text-sm text-[#6b675f] dark:text-white/55",
          className,
        )}
      >
        <LoaderMark size="sm" />
        <span>{label}</span>
      </div>
    );
  }

  const body = (
    <div className="relative z-10 flex flex-col items-center gap-4 px-4 text-center sm:gap-5">
      <div className="relative flex size-20 items-center justify-center sm:size-24">
        <span
          aria-hidden
          className="brand-loader-ring absolute inset-0 rounded-full border-2 border-[#efd56a]/35 border-t-[#efd56a]"
        />
        <span
          aria-hidden
          className="brand-loader-ring-reverse absolute inset-2 rounded-full border border-[#1c1c1c]/15 border-b-[#1c1c1c]/55 dark:border-white/15 dark:border-b-white/50"
        />
        <BrandMark
          size="lg"
          className="brand-loader-mark relative z-10 bg-[#efd56a] text-[#1c1c1c] shadow-sm sm:size-14 sm:text-xl"
        />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium tracking-tight text-[#1c1c1c] dark:text-[#f4f1ea]">
          {label}
        </p>
        <p className="text-xs text-[#8a857a] dark:text-white/40">Clinexa</p>
      </div>
    </div>
  );

  if (variant === "overlay") {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        className={cn(
          "absolute inset-0 z-40 flex items-center justify-center",
          "bg-[color-mix(in_oklch,#f7f4ef_78%,transparent)] backdrop-blur-[2px]",
          "dark:bg-[color-mix(in_oklch,#16181c_78%,transparent)]",
          className,
        )}
      >
        {body}
      </div>
    );
  }

  return (
    <main
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        "relative flex min-h-dvh flex-1 flex-col items-center justify-center overflow-hidden",
        "bg-[linear-gradient(145deg,#f7f4ef_0%,#f3efe8_42%,#f0e2c4_100%)]",
        "dark:bg-[linear-gradient(145deg,#16181c_0%,#1b1e24_45%,#242018_100%)]",
        "px-4 py-12 sm:px-6 sm:py-16",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(239,213,106,0.22),transparent_55%)] dark:bg-[radial-gradient(circle_at_50%_42%,rgba(239,213,106,0.12),transparent_55%)]"
      />
      {body}
    </main>
  );
}

function LoaderMark({ size }: { size: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "relative inline-flex items-center justify-center",
        size === "sm" ? "size-8" : "size-10",
      )}
    >
      <span
        aria-hidden
        className="brand-loader-ring absolute inset-0 rounded-full border-2 border-[#efd56a]/30 border-t-[#efd56a]"
      />
      <BrandMark
        size="sm"
        className="relative z-10 bg-[#efd56a] text-[#1c1c1c]"
      />
    </span>
  );
}
