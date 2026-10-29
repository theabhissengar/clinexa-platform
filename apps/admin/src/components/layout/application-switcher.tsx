"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePermissions } from "@/features/auth/hooks/use-permissions";
import {
  CONTEXT_LABEL,
  CONTEXT_LANDING,
  PLATFORM_CONTEXT_LIST,
  canAccessContext,
  resolveContextFromPathname,
} from "@/lib/platform-context";
import { cn } from "@/lib/utils";
import { useAppSwitchLoader } from "@/providers/app-switch-loader-provider";

const switcherTriggerClass =
  "h-8 gap-1.5 rounded-full border-black/8 bg-white/80 px-2.5 shadow-none hover:bg-white dark:border-white/12 dark:bg-white/8 dark:hover:bg-white/12";

function ContextStatusDot({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-flex size-2.5 shrink-0 items-center justify-center",
        className,
      )}
      aria-hidden
    >
      <span className="absolute inset-0 rounded-full bg-emerald-400/35 blur-[2px]" />
      <span
        className={cn(
          "relative size-2 rounded-full",
          "bg-[radial-gradient(circle_at_30%_28%,#d1fae5_0%,#34d399_42%,#059669_100%)]",
          "shadow-[inset_0_1px_1px_rgba(255,255,255,0.65),0_0_0_1px_rgba(5,150,105,0.35),0_0_6px_rgba(52,211,153,0.55)]",
        )}
      />
    </span>
  );
}

/**
 * Application Switcher — CRM | Guardian (NAV-100–104).
 * Replaces the Vendor Switcher placeholder. Same session; navigation + URL only.
 * Vendor switching, if introduced later, must be a separate header control.
 */
export function ApplicationSwitcher() {
  const pathname = usePathname();
  const router = useRouter();
  const { can } = usePermissions();
  const { beginSwitch } = useAppSwitchLoader();

  const active = resolveContextFromPathname(pathname);
  const accessible = PLATFORM_CONTEXT_LIST.filter((context) =>
    canAccessContext(context, can),
  );

  if (accessible.length === 0) {
    return null;
  }

  if (accessible.length === 1) {
    const only = accessible[0];
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(switcherTriggerClass, "pointer-events-none")}
        aria-label={`Application context: ${CONTEXT_LABEL[only]}`}
      >
        <ContextStatusDot />
        <span className="text-sm font-medium">{CONTEXT_LABEL[only]}</span>
      </Button>
    );
  }

  const currentLabel = active ? CONTEXT_LABEL[active] : "Context";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={switcherTriggerClass}
            aria-label="Switch application context"
          />
        }
      >
        <ContextStatusDot />
        <span className="text-sm font-medium">{currentLabel}</span>
        <ChevronsUpDown className="size-3.5 opacity-50" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        {accessible.map((context) => {
          const isActive = context === active;
          return (
            <DropdownMenuItem
              key={context}
              className="gap-2"
              onClick={() => {
                if (!isActive) {
                  beginSwitch(context);
                  router.push(CONTEXT_LANDING[context]);
                }
              }}
            >
              <Check
                className={`size-3.5 ${isActive ? "opacity-100" : "opacity-0"}`}
                aria-hidden
              />
              <span className={isActive ? "font-medium" : undefined}>
                {CONTEXT_LABEL[context]}
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
