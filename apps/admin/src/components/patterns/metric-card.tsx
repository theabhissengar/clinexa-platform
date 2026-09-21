import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type MetricTone = "neutral" | "warning" | "destructive";

type MetricCardProps = {
  label: React.ReactNode;
  value?: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  href?: string;
  tone?: MetricTone;
  loading?: boolean;
  className?: string;
};

const TONE_CLASS: Record<MetricTone, string> = {
  neutral: "",
  warning: "ring-warning/25",
  destructive: "ring-destructive/25",
};

function MetricCardSurface({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
  loading = false,
  className,
}: Omit<MetricCardProps, "href">) {
  return (
    <Card
      size="sm"
      className={cn(
        "h-full min-w-0 transition-colors",
        TONE_CLASS[tone],
        className,
      )}
    >
      <CardContent className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <p className="text-label font-medium text-muted-foreground">{label}</p>
          {icon ? (
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4"
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
            <p className="font-heading text-h1 font-semibold tabular-nums tracking-tight text-card-foreground">
              {value ?? "—"}
            </p>
            {hint ? (
              <p className="mt-1 text-caption text-muted-foreground">{hint}</p>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function MetricCard({ href, ...props }: MetricCardProps) {
  if (!href) {
    return <MetricCardSurface {...props} />;
  }

  return (
    <Link
      href={href}
      className="block min-w-0 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <MetricCardSurface
        {...props}
        className={cn(
          "hover:bg-[color-mix(in_oklch,var(--card),var(--primary)_3%)]",
          props.className,
        )}
      />
    </Link>
  );
}
