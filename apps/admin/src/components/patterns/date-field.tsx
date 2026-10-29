"use client";

import { format, isValid, parse } from "date-fns";
import { CalendarIcon, XIcon } from "lucide-react";
import * as React from "react";

import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type DateFieldProps = {
  /** ISO calendar date `YYYY-MM-DD`, or empty string when unset. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
};

function parseIsoDate(value: string): Date | undefined {
  if (!value) return undefined;
  const parsed = parse(value.slice(0, 10), "yyyy-MM-dd", new Date());
  return isValid(parsed) ? parsed : undefined;
}

function toIsoDate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function toDisplay(value: string): string {
  const date = parseIsoDate(value);
  return date ? format(date, "dd-MM-yyyy") : "";
}

/** Accepts `dd-MM-yyyy`, `dd/MM/yyyy`, or `yyyy-MM-dd`. */
function parseTypedDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  for (const pattern of ["dd-MM-yyyy", "dd/MM/yyyy", "yyyy-MM-dd"] as const) {
    const parsed = parse(trimmed, pattern, new Date());
    if (isValid(parsed) && format(parsed, pattern) === trimmed) {
      return toIsoDate(parsed);
    }
  }

  // Lenient: digits only ddmmyyyy
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 8) {
    const parsed = parse(digits, "ddMMyyyy", new Date());
    if (isValid(parsed)) return toIsoDate(parsed);
  }

  return null;
}

/**
 * Date field: type `dd-mm-yyyy` manually; open calendar only via the icon.
 */
export function DateField({
  value,
  onChange,
  placeholder = "dd-mm-yyyy",
  disabled,
  className,
  "aria-label": ariaLabel,
}: DateFieldProps) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(() => toDisplay(value));
  const selected = parseIsoDate(value);

  React.useEffect(() => {
    setDraft(toDisplay(value));
  }, [value]);

  function commitDraft(nextDraft: string) {
    const parsed = parseTypedDate(nextDraft);
    if (parsed === null) {
      setDraft(toDisplay(value));
      return;
    }
    if (parsed !== value) onChange(parsed);
    setDraft(parsed ? toDisplay(parsed) : "");
  }

  return (
    <div
      data-slot="date-field"
      className={cn(
        "relative flex h-9 w-full min-w-0 items-center rounded-lg border border-border bg-muted/40 shadow-none dark:bg-muted/30",
        "focus-within:border-ring focus-within:bg-card focus-within:ring-2 focus-within:ring-ring/30",
        disabled && "opacity-50",
        className,
      )}
    >
      <Input
        type="text"
        inputMode="numeric"
        disabled={disabled}
        value={draft}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="h-9 border-0 bg-transparent pr-16 shadow-none focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => commitDraft(draft)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commitDraft(draft);
            (event.target as HTMLInputElement).blur();
          }
        }}
      />
      <div className="absolute right-1 top-1/2 z-10 flex -translate-y-1/2 items-center gap-0.5">
        {value && !disabled ? (
          <button
            type="button"
            aria-label="Clear date"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => {
              onChange("");
              setDraft("");
            }}
          >
            <XIcon className="size-3.5" />
          </button>
        ) : null}
        <Popover
          open={open}
          onOpenChange={(next, details) => {
            if (!next) {
              // Month/year AppSelect portals outside the popover; keep calendar open.
              if (
                details.reason === "focus-out" ||
                details.reason === "outside-press"
              ) {
                const target = (details as { event?: Event }).event
                  ?.target as Element | null;
                if (
                  target?.closest?.(
                    '[data-slot="select-content"], [data-slot="select-trigger"], [data-slot="calendar"]',
                  )
                ) {
                  details.cancel();
                  return;
                }
                if (details.reason === "focus-out") {
                  details.cancel();
                  return;
                }
              }
            }
            setOpen(next);
          }}
        >
          <PopoverTrigger
            disabled={disabled}
            type="button"
            aria-label={
              ariaLabel ? `Open calendar for ${ariaLabel}` : "Open calendar"
            }
            className={cn(
              "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none",
              "hover:bg-muted hover:text-foreground",
              "focus-visible:ring-2 focus-visible:ring-ring/40",
              "disabled:pointer-events-none disabled:opacity-50",
            )}
          >
            <CalendarIcon className="size-3.5" />
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="end" sideOffset={6}>
            <Calendar
              mode="single"
              selected={selected}
              onSelect={(date) => {
                onChange(date ? toIsoDate(date) : "");
                setOpen(false);
              }}
              defaultMonth={selected ?? new Date()}
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
