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
  PlatformContexts,
  canAccessContext,
  resolveContextFromPathname,
  type PlatformContext,
} from "@/lib/platform-context";

const SWITCHER_CONTEXTS: readonly PlatformContext[] = [
  PlatformContexts.CRM,
  PlatformContexts.GUARDIAN,
];

/**
 * Application Switcher — CRM | Guardian (NAV-100–104).
 * Replaces the Vendor Switcher placeholder. Same session; navigation + URL only.
 * Vendor switching, if introduced later, must be a separate header control.
 */
export function ApplicationSwitcher() {
  const pathname = usePathname();
  const router = useRouter();
  const { can } = usePermissions();

  const active = resolveContextFromPathname(pathname);
  const accessible = SWITCHER_CONTEXTS.filter((context) =>
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
        className="gap-2 pointer-events-none"
        aria-label={`Application context: ${CONTEXT_LABEL[only]}`}
      >
        <span className="font-medium">{CONTEXT_LABEL[only]}</span>
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
            className="gap-2"
            aria-label="Switch application context"
          />
        }
      >
        <span className="font-medium">{currentLabel}</span>
        <ChevronsUpDown className="size-3.5 opacity-60" aria-hidden />
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
                  router.push(CONTEXT_LANDING[context]);
                }
              }}
            >
              <Check
                className={`size-3.5 ${isActive ? "opacity-100" : "opacity-0"}`}
                aria-hidden
              />
              <span>{CONTEXT_LABEL[context]}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
