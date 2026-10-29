"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ClearableSearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  "aria-label"?: string;
};

export function ClearableSearchInput({
  value,
  onChange,
  onClear,
  placeholder,
  className,
  inputClassName,
  "aria-label": ariaLabel,
}: ClearableSearchInputProps) {
  return (
    <div className={cn("relative min-w-0", className)}>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={cn(
          "h-9 rounded-lg border-border bg-muted/40 pr-8 shadow-none focus-visible:bg-card dark:bg-muted/30",
          inputClassName,
        )}
      />
      {value ? (
        <button
          type="button"
          onClick={onClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
