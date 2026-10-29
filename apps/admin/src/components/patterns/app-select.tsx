"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type AppSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type AppSelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: AppSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  /** Use filter-height muted trigger (h-9). Default true for form/filter parity. */
  size?: "default" | "sm" | "filter";
};

/** Base UI Select rejects empty-string item values; map them. */
const EMPTY_VALUE = "__clinexa_empty__";

function toInternal(value: string): string {
  return value === "" ? EMPTY_VALUE : value;
}

function toExternal(value: string): string {
  return value === EMPTY_VALUE ? "" : value;
}

/**
 * Branded single-select used across filters and forms.
 * Empty-string values are supported (e.g. “All …” options).
 */
export function AppSelect({
  value,
  onValueChange,
  options,
  placeholder = "Select…",
  disabled,
  className,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  size = "filter",
}: AppSelectProps) {
  const hasEmptyOption = options.some((option) => option.value === "");
  const selectValue =
    value === "" && !hasEmptyOption ? undefined : toInternal(value);
  const items = Object.fromEntries(
    options.map((option) => [toInternal(option.value), option.label]),
  );

  return (
    <Select
      value={selectValue}
      onValueChange={(next) => {
        if (typeof next === "string") onValueChange(toExternal(next));
      }}
      disabled={disabled}
      items={items}
    >
      <SelectTrigger
        size={size}
        className={cn("min-w-0", className)}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid || undefined}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem
            key={toInternal(option.value)}
            value={toInternal(option.value)}
            disabled={option.disabled}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
