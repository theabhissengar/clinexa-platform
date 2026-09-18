import { Badge } from "@/components/ui/badge";
import {
  resolveStatusSemantics,
  type StatusTone,
} from "@/lib/status-semantics";
import { cn } from "@/lib/utils";

const TONE_CLASS: Record<StatusTone, string> = {
  neutral:
    "border-border bg-muted text-muted-foreground",
  info: "border-info/25 bg-info/10 text-info",
  positive: "border-success/25 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  destructive: "border-destructive/25 bg-destructive/10 text-destructive",
  hold: "border-hold/25 bg-hold/10 text-hold",
  admin: "border-border bg-secondary text-secondary-foreground",
};

type StatusBadgeProps = {
  status: string;
  label?: string;
  tone?: StatusTone;
  className?: string;
};

/**
 * Shared status chip. Color is supporting only — the visible label is required.
 * Not wired into CRM/Guardian feature pages in Phase 5A.
 */
export function StatusBadge({
  status,
  label,
  tone,
  className,
}: StatusBadgeProps) {
  const semantics = resolveStatusSemantics(status);
  const displayLabel = label?.trim() || semantics.label;
  const displayTone = tone ?? semantics.tone;

  return (
    <Badge
      variant="outline"
      title={semantics.value}
      data-slot="status-badge"
      data-status={semantics.value}
      data-tone={displayTone}
      className={cn(TONE_CLASS[displayTone], className)}
    >
      <span>{displayLabel}</span>
    </Badge>
  );
}
