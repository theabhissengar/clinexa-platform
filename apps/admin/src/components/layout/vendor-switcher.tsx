"use client";

import { Building2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Vendor Switcher abstraction.
 *
 * Phase 6: disabled placeholder. Future multi-vendor support must replace
 * only this implementation — not the surrounding AppHeader layout.
 * Do not introduce local state that assumes a single vendor forever.
 */
export function VendorSwitcher() {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            disabled
            aria-label="Vendor switcher (coming soon)"
          />
        }
      >
        <Building2 className="size-3.5" />
        <span className="hidden sm:inline">Vendor</span>
      </TooltipTrigger>
      <TooltipContent>Coming soon</TooltipContent>
    </Tooltip>
  );
}
