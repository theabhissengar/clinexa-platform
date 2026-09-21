import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { MetricAccent } from "@/components/patterns/metric-card";
import { cn } from "@/lib/utils";

export type DashboardSurface = "default" | "crm" | "guardian";

type DashboardSectionCardProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  href?: string;
  actionLabel?: string;
  surface?: DashboardSurface;
  accent?: MetricAccent;
  children: React.ReactNode;
  className?: string;
};

const ACCENT_SURFACE: Record<MetricAccent, string> = {
  sky: "!bg-[color-mix(in_oklch,white_62%,var(--info)_38%)] ring-info/30 dark:!bg-[color-mix(in_oklch,var(--card)_58%,var(--info)_42%)] dark:ring-info/35",
  teal: "!bg-[color-mix(in_oklch,white_60%,var(--success)_40%)] ring-success/30 dark:!bg-[color-mix(in_oklch,var(--card)_58%,var(--success)_42%)] dark:ring-success/35",
  amber:
    "!bg-[color-mix(in_oklch,white_58%,var(--warning)_42%)] ring-warning/35 dark:!bg-[color-mix(in_oklch,var(--card)_55%,var(--warning)_45%)] dark:ring-warning/40",
  violet:
    "!bg-[color-mix(in_oklch,white_60%,var(--hold)_40%)] ring-hold/30 dark:!bg-[color-mix(in_oklch,var(--card)_58%,var(--hold)_42%)] dark:ring-hold/35",
  rose: "!bg-[color-mix(in_oklch,white_60%,var(--destructive)_40%)] ring-destructive/30 dark:!bg-[color-mix(in_oklch,var(--card)_58%,var(--destructive)_42%)] dark:ring-destructive/35",
  emerald:
    "!bg-[color-mix(in_oklch,white_58%,var(--chart-2)_42%)] ring-success/28 dark:!bg-[color-mix(in_oklch,var(--card)_55%,var(--chart-2)_45%)] dark:ring-success/32",
  coral:
    "!bg-[color-mix(in_oklch,white_58%,var(--chart-4)_42%)] ring-warning/28 dark:!bg-[color-mix(in_oklch,var(--card)_55%,var(--chart-4)_45%)] dark:ring-warning/32",
  slate:
    "!bg-[color-mix(in_oklch,white_64%,var(--primary)_36%)] ring-primary/28 dark:!bg-[color-mix(in_oklch,var(--card)_60%,var(--primary)_40%)] dark:ring-primary/35",
};

const ACCENT_BORDER: Record<MetricAccent, string> = {
  sky: "border-info/20",
  teal: "border-success/20",
  amber: "border-warning/25",
  violet: "border-hold/20",
  rose: "border-destructive/20",
  emerald: "border-success/18",
  coral: "border-warning/18",
  slate: "border-primary/20",
};

export function DashboardSectionCard({
  title,
  description,
  href,
  actionLabel = "View all",
  surface = "default",
  accent = "sky",
  children,
  className,
}: DashboardSectionCardProps) {
  const themed = surface === "crm" || surface === "guardian";

  return (
    <Card
      className={cn(
        "min-w-0",
        themed && "border-0 ring-1 backdrop-blur-sm",
        themed && ACCENT_SURFACE[accent],
        surface === "crm" && "rounded-2xl",
        surface === "guardian" && "rounded-xl",
        !themed && "bg-card",
        className,
      )}
    >
      <CardHeader
        className={cn(themed && "border-b", themed && ACCENT_BORDER[accent])}
      >
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
        {description ? (
          <CardDescription>{description}</CardDescription>
        ) : null}
        {href ? (
          <CardAction>
            <Link
              href={href}
              className={buttonVariants({
                variant: "ghost",
                size: "sm",
              })}
            >
              {actionLabel}
            </Link>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="min-w-0">{children}</CardContent>
    </Card>
  );
}
