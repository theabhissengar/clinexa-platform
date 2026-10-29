"use client";

import { ChevronDown, ChevronUp, ListFilter } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FilterPanelTopProps = {
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
};

/**
 * Aligns status chips (left) with filter toggle + page actions (right).
 */
export function FilterPanelTop({
  children,
  actions,
  className,
}: FilterPanelTopProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4",
        className,
      )}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:pb-0.5">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

type FilterFieldsToggleProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
};

export function FilterFieldsToggle({
  open,
  onOpenChange,
  className,
}: FilterFieldsToggleProps) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      aria-expanded={open}
      aria-controls="module-filter-fields"
      className={className}
      onClick={() => onOpenChange(!open)}
    >
      <ListFilter className="size-3.5" aria-hidden />
      Filters
      {open ? (
        <ChevronUp className="size-3.5" aria-hidden />
      ) : (
        <ChevronDown className="size-3.5" aria-hidden />
      )}
    </Button>
  );
}

type CollapsibleFilterFieldsProps = {
  open: boolean;
  children: React.ReactNode;
  className?: string;
};

/** Secondary filter fields body. Parent owns open state (default closed). */
export function CollapsibleFilterFields({
  open,
  children,
  className,
}: CollapsibleFilterFieldsProps) {
  if (!open) return null;
  return (
    <div
      id="module-filter-fields"
      className={cn("min-w-0 border-t border-border/70 pt-3", className)}
    >
      {children}
    </div>
  );
}
