import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import type { MetricAccent } from "@/components/patterns/metric-card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { DashboardSurface } from "./dashboard-section-card";

export type DashboardShortcut = {
  label: string;
  href: string;
  icon: LucideIcon;
};

type DashboardShortcutsProps = {
  items: DashboardShortcut[];
  surface?: DashboardSurface;
};

const SHORTCUT_ACCENTS: MetricAccent[] = [
  "sky",
  "teal",
  "amber",
  "violet",
  "rose",
  "emerald",
  "coral",
  "slate",
];

const SHORTCUT_BUTTON: Record<MetricAccent, string> = {
  sky: "border-info/35 !bg-[color-mix(in_oklch,white_70%,var(--info)_30%)] text-foreground hover:!bg-[color-mix(in_oklch,white_55%,var(--info)_45%)] dark:!bg-[color-mix(in_oklch,var(--card)_65%,var(--info)_35%)]",
  teal: "border-success/35 !bg-[color-mix(in_oklch,white_68%,var(--success)_32%)] text-foreground hover:!bg-[color-mix(in_oklch,white_52%,var(--success)_48%)] dark:!bg-[color-mix(in_oklch,var(--card)_65%,var(--success)_35%)]",
  amber:
    "border-warning/40 !bg-[color-mix(in_oklch,white_65%,var(--warning)_35%)] text-foreground hover:!bg-[color-mix(in_oklch,white_50%,var(--warning)_50%)] dark:!bg-[color-mix(in_oklch,var(--card)_60%,var(--warning)_40%)]",
  violet:
    "border-hold/35 !bg-[color-mix(in_oklch,white_68%,var(--hold)_32%)] text-foreground hover:!bg-[color-mix(in_oklch,white_52%,var(--hold)_48%)] dark:!bg-[color-mix(in_oklch,var(--card)_65%,var(--hold)_35%)]",
  rose: "border-destructive/35 !bg-[color-mix(in_oklch,white_68%,var(--destructive)_32%)] text-foreground hover:!bg-[color-mix(in_oklch,white_52%,var(--destructive)_48%)] dark:!bg-[color-mix(in_oklch,var(--card)_65%,var(--destructive)_35%)]",
  emerald:
    "border-success/30 !bg-[color-mix(in_oklch,white_65%,var(--chart-2)_35%)] text-foreground hover:!bg-[color-mix(in_oklch,white_50%,var(--chart-2)_50%)] dark:!bg-[color-mix(in_oklch,var(--card)_60%,var(--chart-2)_40%)]",
  coral:
    "border-warning/30 !bg-[color-mix(in_oklch,white_65%,var(--chart-4)_35%)] text-foreground hover:!bg-[color-mix(in_oklch,white_50%,var(--chart-4)_50%)] dark:!bg-[color-mix(in_oklch,var(--card)_60%,var(--chart-4)_40%)]",
  slate:
    "border-primary/35 !bg-[color-mix(in_oklch,white_70%,var(--primary)_30%)] text-foreground hover:!bg-[color-mix(in_oklch,white_55%,var(--primary)_45%)] dark:!bg-[color-mix(in_oklch,var(--card)_65%,var(--primary)_35%)]",
};

export function DashboardShortcuts({
  items,
  surface = "default",
}: DashboardShortcutsProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="dashboard-shortcuts-title"
      className={cn(
        surface === "crm" &&
          "rounded-2xl !bg-[color-mix(in_oklch,white_72%,var(--info)_28%)] p-4 ring-1 ring-info/25 dark:!bg-[color-mix(in_oklch,var(--card)_70%,var(--info)_30%)]",
        surface === "guardian" &&
          "rounded-xl !bg-[color-mix(in_oklch,white_70%,var(--primary)_30%)] p-4 ring-1 ring-primary/25 dark:!bg-[color-mix(in_oklch,var(--card)_70%,var(--primary)_30%)]",
      )}
    >
      <h2
        id="dashboard-shortcuts-title"
        className="font-heading text-h2 font-semibold text-foreground"
      >
        Quick access
      </h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map(({ label, href, icon: Icon }, index) => {
          const accent = SHORTCUT_ACCENTS[index % SHORTCUT_ACCENTS.length];
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                buttonVariants({ variant: "outline" }),
                surface !== "default" && SHORTCUT_BUTTON[accent],
              )}
            >
              <Icon data-icon="inline-start" aria-hidden />
              {label}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
