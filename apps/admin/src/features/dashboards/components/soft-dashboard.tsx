import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Soft cream / charcoal dashboard surface — presentation only. */
export function SoftDashboardShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative isolate min-h-full min-w-0 flex-1",
        "bg-[linear-gradient(145deg,#f7f4ef_0%,#f3efe8_42%,#f0e2c4_100%)]",
        "dark:bg-[linear-gradient(145deg,#16181c_0%,#1b1e24_45%,#242018_100%)]",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(255,255,255,0.55),transparent_42%),radial-gradient(circle_at_88%_92%,rgba(232,200,74,0.18),transparent_40%)] dark:bg-[radial-gradient(circle_at_12%_8%,rgba(255,255,255,0.04),transparent_42%),radial-gradient(circle_at_88%_92%,rgba(232,200,74,0.08),transparent_40%)]"
      />
      <div className="relative z-10 mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-5 overflow-x-clip px-4 py-5 sm:gap-6 sm:px-6 sm:py-7 lg:px-8">
        {children}
      </div>
    </div>
  );
}

export function SoftCard({
  children,
  className,
  tone = "light",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "light" | "dark" | "accent";
}) {
  return (
    <section
      className={cn(
        "min-w-0 overflow-hidden rounded-[1.75rem] p-4 shadow-[0_18px_40px_-28px_rgba(30,30,30,0.45)] sm:rounded-[2rem] sm:p-5",
        tone === "light" &&
          "bg-white/90 ring-1 ring-black/5 backdrop-blur-sm dark:bg-white/6 dark:ring-white/10",
        tone === "dark" &&
          "bg-[#1c1c1c] text-white shadow-[0_22px_48px_-24px_rgba(0,0,0,0.7)] ring-1 ring-white/5 dark:bg-[#121417]",
        tone === "accent" &&
          "bg-[linear-gradient(160deg,#f6e7a8_0%,#efd56a_55%,#e6c44a_100%)] text-[#1c1c1c] ring-1 ring-black/5 dark:bg-[linear-gradient(160deg,#3a3418_0%,#5a4d1e_55%,#7a6820_100%)] dark:text-[#f7f1d8] dark:ring-white/10",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function SoftWelcome({
  title,
  subtitle,
  stats,
  action,
}: {
  title: string;
  subtitle: string;
  stats: Array<{
    label: string;
    value: React.ReactNode;
    icon: LucideIcon;
    loading?: boolean;
  }>;
  /** Optional control rendered beside the stat pills (e.g. Insights flip). */
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0 flex-1">
        <h1 className="font-heading text-[1.75rem] font-semibold tracking-tight text-[#1c1c1c] sm:text-[2.15rem] dark:text-[#f4f1ea]">
          {title}
        </h1>
        <p className="mt-1 max-w-xl text-sm text-[#6b675f] sm:min-h-10 sm:text-[0.95rem] dark:text-white/55">
          {subtitle}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:gap-3">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="flex min-w-[7.5rem] items-center gap-2.5 rounded-full bg-white/85 px-3.5 py-2 ring-1 ring-black/5 dark:bg-white/8 dark:ring-white/10"
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-[#1c1c1c] text-white dark:bg-[#efd56a] dark:text-[#1c1c1c]">
                <Icon className="size-3.5" aria-hidden />
              </span>
              <div className="min-w-0 leading-tight">
                <p className="text-[0.65rem] font-medium tracking-wide text-[#8a857a] uppercase dark:text-white/45">
                  {stat.label}
                </p>
                {stat.loading ? (
                  <Skeleton className="mt-0.5 h-5 w-10 rounded-full" />
                ) : (
                  <p className="text-lg font-semibold tabular-nums text-[#1c1c1c] dark:text-white">
                    {stat.value ?? "—"}
                  </p>
                )}
              </div>
            </div>
          );
        })}
        {action}
      </div>
    </div>
  );
}

export function SoftProgressRow({
  items,
}: {
  items: Array<{
    label: string;
    value: number;
    max: number;
    tone?: "ink" | "gold" | "ghost";
    href?: string;
  }>;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => {
        const pct =
          item.max > 0
            ? Math.min(100, Math.round((item.value / item.max) * 100))
            : 0;
        const tone = item.tone ?? "ghost";
        const inner = (
          <div
            className={cn(
              "relative h-11 overflow-hidden rounded-full px-4 ring-1",
              tone === "ink" && "bg-[#1c1c1c] ring-black/20 dark:bg-[#efd56a] dark:ring-transparent",
              tone === "gold" &&
                "bg-[#efd56a] ring-black/5 dark:bg-[#7a6820] dark:ring-white/10",
              tone === "ghost" &&
                "bg-white/70 ring-black/5 dark:bg-white/8 dark:ring-white/10",
            )}
          >
            <div
              className={cn(
                "absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out",
                tone === "ink" && "bg-white/15 dark:bg-black/15",
                tone === "gold" && "bg-black/10 dark:bg-white/15",
                tone === "ghost" && "bg-[#1c1c1c]/12 dark:bg-[#efd56a]/20",
              )}
              style={{ width: `${pct}%` }}
            />
            <div
              className={cn(
                "relative z-10 flex h-full items-center justify-between gap-3 text-sm font-medium",
                tone === "ink" && "text-white dark:text-[#1c1c1c]",
                tone === "gold" && "text-[#1c1c1c] dark:text-[#f7f1d8]",
                tone === "ghost" && "text-[#1c1c1c] dark:text-white/85",
              )}
            >
              <span className="truncate">{item.label}</span>
              <span className="tabular-nums opacity-80">
                {item.value}
                <span className="ml-1 text-xs opacity-70">{pct}%</span>
              </span>
            </div>
          </div>
        );
        return item.href ? (
          <Link
            key={item.label}
            href={item.href}
            className="block rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#1c1c1c]/40 dark:focus-visible:ring-[#efd56a]/50"
          >
            {inner}
          </Link>
        ) : (
          <div key={item.label}>{inner}</div>
        );
      })}
    </div>
  );
}

export function SoftCardHeader({
  title,
  href,
  meta,
}: {
  title: string;
  href?: string;
  meta?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {meta ? (
          <p className="mt-0.5 text-sm opacity-60">{meta}</p>
        ) : null}
      </div>
      {href ? (
        <Link
          href={href}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-black/5 text-current transition-colors hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current/30 dark:bg-white/10 dark:hover:bg-white/15"
          aria-label={`Open ${title}`}
        >
          <ArrowUpRight className="size-4" aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}

export function SoftBarChart({
  bars,
  loading,
  onBarClick,
  selectedKey,
  valueFormatter,
}: {
  bars: Array<{
    key?: string;
    label: string;
    value: number;
    active?: boolean;
    detail?: string;
  }>;
  loading?: boolean;
  onBarClick?: (key: string) => void;
  selectedKey?: string | null;
  valueFormatter?: (value: number) => string;
}) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  if (loading) {
    return (
      <div className="flex h-36 items-end gap-2">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton
            key={i}
            className="flex-1 rounded-full"
            style={{ height: `${30 + (i % 4) * 15}%` }}
          />
        ))}
      </div>
    );
  }
  return (
    <TooltipProvider delay={120}>
      <div className="flex h-40 items-end gap-2 sm:gap-2.5">
        {bars.map((bar) => {
          const key = bar.key ?? bar.label;
          const selected = selectedKey != null && selectedKey === key;
          const highlighted = selected || (selectedKey == null && bar.active);
          const h = Math.max(8, Math.round((bar.value / max) * 100));
          const display = valueFormatter
            ? valueFormatter(bar.value)
            : String(bar.value);
          return (
            <div
              key={key}
              className="flex min-w-0 flex-1 flex-col items-center gap-2"
            >
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      aria-pressed={selected || undefined}
                      aria-label={`${bar.label}: ${display}${bar.detail ? `, ${bar.detail}` : ""}`}
                      onClick={() => onBarClick?.(key)}
                      className={cn(
                        "flex h-28 w-full items-end justify-center rounded-xl outline-none transition-transform duration-200",
                        "focus-visible:ring-2 focus-visible:ring-[#1c1c1c]/35 dark:focus-visible:ring-[#efd56a]/45",
                        onBarClick && "cursor-pointer hover:scale-[1.03] active:scale-[0.98]",
                      )}
                    />
                  }
                >
                  <div
                    className={cn(
                      "w-full max-w-8 rounded-full transition-[height,background-color,box-shadow] duration-500 ease-out",
                      highlighted
                        ? "bg-[#efd56a] shadow-[0_8px_18px_-8px_rgba(200,160,40,0.9)]"
                        : selectedKey != null
                          ? "bg-[#1c1c1c]/8 dark:bg-white/10"
                          : "bg-[#1c1c1c]/10 dark:bg-white/15",
                      selected && "ring-2 ring-[#1c1c1c]/25 dark:ring-[#efd56a]/40",
                    )}
                    style={{ height: `${h}%` }}
                  />
                </TooltipTrigger>
                <TooltipContent className="flex-col items-start gap-0.5 bg-[#1c1c1c] px-3 py-2 text-left text-white dark:bg-[#efd56a] dark:text-[#1c1c1c]">
                  <span className="font-semibold">{bar.label}</span>
                  <span className="tabular-nums opacity-90">{display}</span>
                  {bar.detail ? (
                    <span className="text-[0.7rem] opacity-70">{bar.detail}</span>
                  ) : null}
                </TooltipContent>
              </Tooltip>
              <span className="text-[0.65rem] font-medium tracking-wide text-[#8a857a] uppercase dark:text-white/40">
                {bar.label}
              </span>
            </div>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

export function SoftRingStat({
  label,
  valueLabel,
  percent,
  loading,
}: {
  label: string;
  valueLabel: string;
  percent: number;
  loading?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const r = 54;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-2">
      <div className="relative size-40">
        <svg viewBox="0 0 128 128" className="size-full -rotate-90" aria-hidden>
          <circle
            cx="64"
            cy="64"
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth="12"
            className="text-black/8 dark:text-white/10"
          />
          <circle
            cx="64"
            cy="64"
            r={r}
            fill="none"
            stroke="#efd56a"
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={loading ? c : offset}
            className="transition-[stroke-dashoffset] duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {loading ? (
            <Skeleton className="h-8 w-16 rounded-full" />
          ) : (
            <>
              <p className="text-2xl font-semibold tabular-nums tracking-tight">
                {valueLabel}
              </p>
              <p className="text-xs opacity-55">{clamped}%</p>
            </>
          )}
        </div>
      </div>
      <p className="text-sm font-medium opacity-70">{label}</p>
    </div>
  );
}

export function SoftTaskList({
  title,
  meta,
  items,
  empty,
}: {
  title: string;
  meta?: string;
  items: Array<{
    id: string;
    label: string;
    hint?: string;
    href: string;
    done?: boolean;
  }>;
  empty?: string;
}) {
  return (
    <SoftCard tone="dark" className="flex h-full flex-col">
      <div className="mb-4">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {meta ? <p className="mt-0.5 text-sm text-white/50">{meta}</p> : null}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-white/45">{empty ?? "Nothing needs attention."}</p>
      ) : (
        <ul className="flex flex-1 flex-col gap-1.5">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                className="flex items-center gap-3 rounded-2xl px-2.5 py-2.5 transition-colors hover:bg-white/6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#efd56a]/50"
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    item.done
                      ? "bg-[#efd56a] text-[#1c1c1c]"
                      : "bg-white/10 text-white/70",
                  )}
                  aria-hidden
                >
                  {item.done ? "✓" : "·"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {item.label}
                  </span>
                  {item.hint ? (
                    <span className="block truncate text-xs text-white/40">
                      {item.hint}
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SoftCard>
  );
}

export function SoftLinkRow({
  items,
}: {
  items: Array<{
    label: string;
    description?: string;
    href: string;
    badge?: React.ReactNode;
  }>;
}) {
  return (
    <ul className="divide-y divide-black/5 dark:divide-white/8">
      {items.map((item) => (
        <li key={item.href}>
          <Link
            href={item.href}
            className="flex items-center gap-3 py-3.5 transition-colors hover:bg-black/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1c1c1c]/25 dark:hover:bg-white/[0.03] dark:focus-visible:ring-[#efd56a]/40"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-[#1c1c1c] dark:text-white">
                {item.label}
              </span>
              {item.description ? (
                <span className="mt-0.5 block truncate text-xs text-[#8a857a] dark:text-white/45">
                  {item.description}
                </span>
              ) : null}
            </span>
            {item.badge ? (
              <span className="shrink-0 rounded-full bg-[#1c1c1c] px-2.5 py-1 text-[0.65rem] font-medium text-white dark:bg-[#efd56a] dark:text-[#1c1c1c]">
                {item.badge}
              </span>
            ) : null}
            <ArrowUpRight
              className="size-4 shrink-0 text-[#8a857a] dark:text-white/35"
              aria-hidden
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function greetingNameFromEmail(email?: string | null): string {
  if (!email) return "there";
  const local = email.split("@")[0] ?? email;
  const cleaned = local.replace(/[._-]+/g, " ").trim();
  if (!cleaned) return "there";
  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
