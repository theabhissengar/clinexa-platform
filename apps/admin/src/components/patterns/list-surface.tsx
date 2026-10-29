import { cn } from "@/lib/utils";

type SlotProps = {
  children: React.ReactNode;
  className?: string;
};

/**
 * Opaque elevated surface for list tables — blocks page atmosphere
 * from showing through table cells.
 */
export function ListSurface({ children, className }: SlotProps) {
  return (
    <div
      data-slot="list-surface"
      className={cn(
        "min-w-0 overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm",
        "ring-1 ring-foreground/5",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Opaque filter toolbar for module index pages.
 */
export function FilterPanel({ children, className }: SlotProps) {
  return (
    <div
      data-slot="filter-panel"
      className={cn(
        "flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-3 text-card-foreground shadow-sm sm:p-4",
        "ring-1 ring-foreground/5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function FilterPanelSection({ children, className }: SlotProps) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      {children}
    </div>
  );
}

export function FilterPanelLabel({ children, className }: SlotProps) {
  return (
    <p
      className={cn(
        "text-[0.65rem] font-medium tracking-[0.08em] text-muted-foreground uppercase",
        className,
      )}
    >
      {children}
    </p>
  );
}

type FilterChipProps = {
  active?: boolean;
  count?: number;
  children: React.ReactNode;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

export function FilterChip({
  active = false,
  count,
  children,
  className,
  type = "button",
  ...props
}: FilterChipProps) {
  return (
    <button
      type={type}
      data-active={active ? "true" : undefined}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        active
          ? "border-foreground/15 bg-foreground text-background shadow-sm"
          : "border-transparent bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground",
        className,
      )}
      {...props}
    >
      <span>{children}</span>
      {typeof count === "number" ? (
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[0.65rem] tabular-nums leading-none",
            active ? "bg-background/20 text-background" : "bg-background/60 text-muted-foreground",
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

export function FilterChipTrack({ children, className }: SlotProps) {
  return (
    <div
      className={cn(
        "-mx-1 flex min-w-0 gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:thin]",
        className,
      )}
    >
      {children}
    </div>
  );
}

type FilterControlProps = {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

export function FilterControl({ label, children, className }: FilterControlProps) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <span className="truncate text-[0.65rem] font-medium tracking-[0.06em] text-muted-foreground uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}

/** Shared opaque control surface for selects / date inputs inside FilterPanel. */
export const filterControlClassName =
  "h-9 w-full min-w-0 rounded-lg border border-border bg-muted/40 px-2.5 text-sm text-foreground shadow-none outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-muted/30";

/** Compact width for inline filter rows on module index pages. */
export const filterControlCompactClassName = "w-[10.5rem] shrink-0";

/** Single-line filter field row — evenly spaced, bottom-aligned controls. */
export const filterFieldsRowClassName =
  "flex w-full flex-nowrap items-end gap-3 overflow-x-auto pb-1 sm:gap-4";

/** Checkbox aligned to the control baseline in a filter row. */
export const filterInlineCheckboxClassName =
  "mb-0 flex h-9 shrink-0 items-center gap-2 whitespace-nowrap text-sm text-muted-foreground";

/** Primary filter Apply action — teal in light/dark so it reads as an action, not brand gold. */
export const filterApplyButtonClassName =
  "border-transparent bg-success text-success-foreground hover:bg-success/90 focus-visible:ring-success/40";

/** Cross-app navigation (Open in CRM / Open in Guardian) — info blue in light/dark. */
export const crossAppNavButtonClassName =
  "border-transparent bg-info text-info-foreground hover:bg-info/90 focus-visible:ring-info/40";
