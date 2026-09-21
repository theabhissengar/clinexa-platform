import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type MetricTone = "neutral" | "warning" | "destructive";
export type MetricSurface = "default" | "crm" | "guardian";
export type MetricAccent =
  | "sky"
  | "teal"
  | "amber"
  | "violet"
  | "rose"
  | "emerald"
  | "coral"
  | "slate";

type MetricCardProps = {
  label: React.ReactNode;
  value?: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  href?: string;
  tone?: MetricTone;
  surface?: MetricSurface;
  accent?: MetricAccent;
  loading?: boolean;
  className?: string;
};

/** Distinct fills per accent — readable in light and dark. */
const ACCENT_SURFACE: Record<MetricAccent, string> = {
  sky: "!bg-[color-mix(in_oklch,white_58%,var(--info)_42%)] ring-info/35 dark:!bg-[color-mix(in_oklch,var(--card)_55%,var(--info)_45%)] dark:ring-info/40",
  teal: "!bg-[color-mix(in_oklch,white_55%,var(--success)_45%)] ring-success/35 dark:!bg-[color-mix(in_oklch,var(--card)_55%,var(--success)_45%)] dark:ring-success/40",
  amber:
    "!bg-[color-mix(in_oklch,white_52%,var(--warning)_48%)] ring-warning/40 dark:!bg-[color-mix(in_oklch,var(--card)_52%,var(--warning)_48%)] dark:ring-warning/45",
  violet:
    "!bg-[color-mix(in_oklch,white_55%,var(--hold)_45%)] ring-hold/35 dark:!bg-[color-mix(in_oklch,var(--card)_55%,var(--hold)_45%)] dark:ring-hold/40",
  rose: "!bg-[color-mix(in_oklch,white_55%,var(--destructive)_45%)] ring-destructive/35 dark:!bg-[color-mix(in_oklch,var(--card)_55%,var(--destructive)_45%)] dark:ring-destructive/40",
  emerald:
    "!bg-[color-mix(in_oklch,white_52%,var(--chart-2)_48%)] ring-success/30 dark:!bg-[color-mix(in_oklch,var(--card)_52%,var(--chart-2)_48%)] dark:ring-success/35",
  coral:
    "!bg-[color-mix(in_oklch,white_52%,var(--chart-4)_48%)] ring-warning/30 dark:!bg-[color-mix(in_oklch,var(--card)_52%,var(--chart-4)_48%)] dark:ring-warning/35",
  slate:
    "!bg-[color-mix(in_oklch,white_60%,var(--primary)_40%)] ring-primary/30 dark:!bg-[color-mix(in_oklch,var(--card)_58%,var(--primary)_42%)] dark:ring-primary/40",
};

const ACCENT_BAR: Record<MetricAccent, string> = {
  sky: "var(--info)",
  teal: "var(--success)",
  amber: "var(--warning)",
  violet: "var(--hold)",
  rose: "var(--destructive)",
  emerald: "var(--chart-2)",
  coral: "var(--chart-4)",
  slate: "var(--primary)",
};

const ACCENT_ICON: Record<MetricAccent, string> = {
  sky: "bg-info/20 text-info dark:bg-info/25 dark:text-info",
  teal: "bg-success/20 text-success dark:bg-success/25 dark:text-success",
  amber: "bg-warning/25 text-warning dark:bg-warning/30 dark:text-warning",
  violet: "bg-hold/20 text-hold dark:bg-hold/25 dark:text-hold",
  rose: "bg-destructive/20 text-destructive dark:bg-destructive/25 dark:text-destructive",
  emerald: "bg-success/18 text-success dark:bg-success/25 dark:text-success",
  coral: "bg-warning/20 text-warning dark:bg-warning/25 dark:text-warning",
  slate: "bg-primary/18 text-primary dark:bg-primary/25 dark:text-primary",
};

const TONE_RING: Record<MetricTone, string> = {
  neutral: "",
  warning: "ring-2 ring-warning/50",
  destructive: "ring-2 ring-destructive/50",
};

function MetricCardSurface({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
  surface = "default",
  accent = "sky",
  loading = false,
  className,
}: Omit<MetricCardProps, "href">) {
  const isCrm = surface === "crm";
  const isGuardian = surface === "guardian";
  const themed = isCrm || isGuardian;

  return (
    <Card
      size="sm"
      className={cn(
        "h-full min-w-0 transition-colors",
        themed && "border-0 ring-1 backdrop-blur-sm",
        themed && ACCENT_SURFACE[accent],
        isCrm && "rounded-2xl",
        isGuardian && "rounded-xl",
        !themed && "bg-card",
        TONE_RING[tone],
        className,
      )}
      style={
        themed
          ? isCrm
            ? { boxShadow: `inset 4px 0 0 0 ${ACCENT_BAR[accent]}` }
            : { boxShadow: `inset 0 3px 0 0 ${ACCENT_BAR[accent]}` }
          : undefined
      }
    >
      <CardContent className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <p className="text-label font-medium text-foreground/70">{label}</p>
          {icon ? (
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center [&_svg]:size-4",
                themed
                  ? cn(
                      isCrm ? "rounded-full" : "rounded-md",
                      ACCENT_ICON[accent],
                    )
                  : "rounded-lg bg-muted text-muted-foreground",
              )}
              aria-hidden
            >
              {icon}
            </span>
          ) : null}
        </div>
        {loading ? (
          <div role="status" aria-label={`Loading ${String(label)}`}>
            <span className="sr-only">Loading</span>
            <Skeleton className="h-8 w-20" />
            {hint ? <Skeleton className="mt-2 h-3 w-28" /> : null}
          </div>
        ) : (
          <div className="min-w-0">
            <p className="font-heading text-h1 font-semibold tabular-nums tracking-tight text-foreground">
              {value ?? "—"}
            </p>
            {hint ? (
              <p className="mt-1 text-caption text-foreground/55">{hint}</p>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function MetricCard({
  href,
  surface = "default",
  accent = "sky",
  ...props
}: MetricCardProps) {
  if (!href) {
    return <MetricCardSurface surface={surface} accent={accent} {...props} />;
  }

  return (
    <Link
      href={href}
      className="block min-w-0 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <MetricCardSurface
        surface={surface}
        accent={accent}
        {...props}
        className={cn(
          themedHover(surface, accent),
          props.className,
        )}
      />
    </Link>
  );
}

function themedHover(surface: MetricSurface, accent: MetricAccent): string {
  if (surface === "default") {
    return "hover:bg-[color-mix(in_oklch,var(--card),var(--primary)_4%)]";
  }
  // Slightly deepen the same accent on hover — keep color identity.
  const deepen: Record<MetricAccent, string> = {
    sky: "hover:!bg-[color-mix(in_oklch,white_48%,var(--info)_52%)] dark:hover:!bg-[color-mix(in_oklch,var(--card)_45%,var(--info)_55%)]",
    teal: "hover:!bg-[color-mix(in_oklch,white_45%,var(--success)_55%)] dark:hover:!bg-[color-mix(in_oklch,var(--card)_45%,var(--success)_55%)]",
    amber:
      "hover:!bg-[color-mix(in_oklch,white_42%,var(--warning)_58%)] dark:hover:!bg-[color-mix(in_oklch,var(--card)_42%,var(--warning)_58%)]",
    violet:
      "hover:!bg-[color-mix(in_oklch,white_45%,var(--hold)_55%)] dark:hover:!bg-[color-mix(in_oklch,var(--card)_45%,var(--hold)_55%)]",
    rose: "hover:!bg-[color-mix(in_oklch,white_45%,var(--destructive)_55%)] dark:hover:!bg-[color-mix(in_oklch,var(--card)_45%,var(--destructive)_55%)]",
    emerald:
      "hover:!bg-[color-mix(in_oklch,white_42%,var(--chart-2)_58%)] dark:hover:!bg-[color-mix(in_oklch,var(--card)_42%,var(--chart-2)_58%)]",
    coral:
      "hover:!bg-[color-mix(in_oklch,white_42%,var(--chart-4)_58%)] dark:hover:!bg-[color-mix(in_oklch,var(--card)_42%,var(--chart-4)_58%)]",
    slate:
      "hover:!bg-[color-mix(in_oklch,white_50%,var(--primary)_50%)] dark:hover:!bg-[color-mix(in_oklch,var(--card)_48%,var(--primary)_52%)]",
  };
  return deepen[accent];
}
