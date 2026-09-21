"use client";

import { Check, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const THEME_OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const;

function subscribe() {
  return () => {};
}

/**
 * Theme switch — light / dark / system via next-themes.
 * Shared by shell header and login (presentation only; do not fork theme state).
 */
export function ThemeToggle({ className }: { className?: string } = {}) {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={cn("relative rounded-full", className)}
            aria-label="Toggle theme"
          />
        }
      >
        <Sun className="size-4 scale-100 rotate-0 transition-all duration-150 ease-out dark:scale-0 dark:-rotate-90" />
        <Moon className="absolute size-4 scale-0 rotate-90 transition-all duration-150 ease-out dark:scale-100 dark:rotate-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {THEME_OPTIONS.map((option) => {
          const isActive = mounted && theme === option.value;
          return (
            <DropdownMenuItem
              key={option.value}
              className="gap-2"
              onClick={() => setTheme(option.value)}
            >
              <Check
                className={`size-3.5 ${isActive ? "opacity-100" : "opacity-0"}`}
                aria-hidden
              />
              <span className={isActive ? "font-medium" : undefined}>
                {option.label}
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
