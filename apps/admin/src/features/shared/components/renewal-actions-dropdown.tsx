"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = {
  disabled?: boolean;
  canCreatePending?: boolean;
  onCreatePending: () => void;
  onProcessRenewal: () => void;
};

export function RenewalActionsDropdown({
  disabled = false,
  canCreatePending = false,
  onCreatePending,
  onProcessRenewal,
}: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button size="sm" variant="outline" disabled={disabled}>
            Renewal actions
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="min-w-52">
        {canCreatePending ? (
          <DropdownMenuItem
            onClick={onCreatePending}
            className="cursor-pointer"
          >
            Create Pending Renewal Order
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={onProcessRenewal} className="cursor-pointer">
          Process Renewal
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
