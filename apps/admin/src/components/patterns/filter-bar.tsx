import { cn } from "@/lib/utils";

type SlotProps = {
  children: React.ReactNode;
  className?: string;
};

/**
 * Presentation-only filter placement. Does not own URL, query, or API state.
 */
export function FilterBar({ children, className }: SlotProps) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>{children}</div>
  );
}

export function FilterBarRow({ children, className }: SlotProps) {
  return (
    <div className={cn("flex flex-wrap items-end gap-3", className)}>
      {children}
    </div>
  );
}

export function FilterBarGroup({ children, className }: SlotProps) {
  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-2", className)}>
      {children}
    </div>
  );
}
