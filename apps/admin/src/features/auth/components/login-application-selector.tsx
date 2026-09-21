"use client";

import { useCallback, useRef, type KeyboardEvent } from "react";

import {
  CONTEXT_LABEL,
  PLATFORM_CONTEXT_LIST,
  type PlatformContext,
} from "@/lib/platform-context";
import { cn } from "@/lib/utils";

type LoginApplicationSelectorProps = {
  value: PlatformContext;
  onChange: (context: PlatformContext) => void;
  disabled?: boolean;
};

export function LoginApplicationSelector({
  value,
  onChange,
  disabled = false,
}: LoginApplicationSelectorProps) {
  const groupRef = useRef<HTMLDivElement>(null);

  const focusOption = useCallback((context: PlatformContext) => {
    requestAnimationFrame(() => {
      groupRef.current
        ?.querySelector<HTMLButtonElement>(`[data-context="${context}"]`)
        ?.focus();
    });
  }, []);

  const selectContext = useCallback(
    (context: PlatformContext | undefined, moveFocus: boolean) => {
      if (!context) {
        return;
      }
      onChange(context);
      if (moveFocus) {
        focusOption(context);
      }
    },
    [focusOption, onChange],
  );

  const selectRelative = useCallback(
    (current: PlatformContext, direction: 1 | -1) => {
      const index = PLATFORM_CONTEXT_LIST.indexOf(current);
      const nextIndex =
        (index + direction + PLATFORM_CONTEXT_LIST.length) %
        PLATFORM_CONTEXT_LIST.length;
      selectContext(PLATFORM_CONTEXT_LIST[nextIndex], true);
    },
    [selectContext],
  );

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) {
      return;
    }

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      selectRelative(value, 1);
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      selectRelative(value, -1);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      selectContext(PLATFORM_CONTEXT_LIST[0], true);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      selectContext(
        PLATFORM_CONTEXT_LIST[PLATFORM_CONTEXT_LIST.length - 1],
        true,
      );
    }
  }

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label="Application"
      aria-disabled={disabled || undefined}
      onKeyDown={handleKeyDown}
      className="grid grid-cols-2 gap-0.5 rounded-lg bg-[color-mix(in_oklch,var(--accent)_28%,transparent)] p-1 ring-1 ring-black/6 dark:bg-input/30 dark:ring-white/10"
    >
      {PLATFORM_CONTEXT_LIST.map((context) => {
        const selected = context === value;

        return (
          <button
            key={context}
            type="button"
            role="radio"
            data-context={context}
            aria-checked={selected}
            disabled={disabled}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(context)}
            className={cn(
              "inline-flex h-8 cursor-pointer items-center justify-center rounded-md px-2.5 text-sm font-medium whitespace-nowrap transition-colors outline-none select-none",
              "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
              selected
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-foreground/70 hover:bg-primary/10 hover:text-foreground",
            )}
          >
            {CONTEXT_LABEL[context]}
          </button>
        );
      })}
    </div>
  );
}
