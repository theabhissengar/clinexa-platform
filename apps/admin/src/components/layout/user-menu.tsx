"use client";

import { ChevronsUpDown, LogOut } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/providers/auth-provider";

function initialsFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local.slice(0, 2).toUpperCase();
}

/**
 * User profile menu — email + sign out.
 * The ChevronsUpDown icon marks this as a dropdown (not a page link).
 */
export function UserMenu() {
  const { user, logout } = useAuth();
  const email = user?.email ?? "";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-2 px-2"
            aria-label="User menu"
          />
        }
      >
        <Avatar className="size-7">
          <AvatarFallback className="text-xs">
            {email ? initialsFromEmail(email) : "?"}
          </AvatarFallback>
        </Avatar>
        <span className="hidden max-w-40 truncate text-sm md:inline">
          {email}
        </span>
        <ChevronsUpDown className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <p className="truncate text-sm text-foreground">{email}</p>
            <p className="text-xs text-muted-foreground">Signed in</p>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            void logout();
          }}
        >
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
