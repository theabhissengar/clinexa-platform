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
            className="h-8 gap-2 rounded-full px-1.5 hover:bg-black/5 sm:px-2 dark:hover:bg-white/10"
            aria-label="User menu"
          />
        }
      >
        <Avatar className="size-7 ring-1 ring-black/8 dark:ring-white/12">
          <AvatarFallback className="bg-[#efd56a] text-xs font-semibold text-[#1c1c1c]">
            {email ? initialsFromEmail(email) : "?"}
          </AvatarFallback>
        </Avatar>
        <span className="hidden max-w-36 truncate text-sm text-[#1c1c1c] lg:inline dark:text-white/90">
          {email}
        </span>
        <ChevronsUpDown
          className="hidden size-3.5 text-[#6b675f] sm:block dark:text-white/50"
          aria-hidden
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <p className="truncate text-sm text-foreground">{email || "Signed in"}</p>
            <p className="text-xs text-muted-foreground">Signed in</p>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            void logout();
          }}
        >
          <LogOut aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
