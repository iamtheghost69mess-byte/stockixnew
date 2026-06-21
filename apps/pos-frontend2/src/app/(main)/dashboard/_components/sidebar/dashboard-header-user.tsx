"use client";

import { LogOut } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePosLogout } from "@/hooks/use-pos-logout";
import { posAuthUserToShellNavDisplay } from "@/lib/pos-auth-user";
import { getInitials } from "@/lib/utils";
import { usePosAuthStore } from "@/stores/pos-auth-store";

/**
 * Header avatar + menu for the signed-in POS staff (replaces demo `AccountSwitcher` users).
 */
export function DashboardHeaderUser() {
  const user = usePosAuthStore((s) => s.user);
  const shell = posAuthUserToShellNavDisplay(user);
  const logout = usePosLogout();
  const roleLine = user?.permissionRole?.trim() ? `${user.role} · ${user.permissionRole}` : (user?.role ?? "");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded-lg outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Account menu"
        >
          <Avatar className="size-9 rounded-lg">
            <AvatarImage src={shell.avatar || undefined} alt={shell.name} />
            <AvatarFallback className="rounded-lg">{getInitials(shell.name)}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-56 rounded-lg" side="bottom" align="end" sideOffset={4}>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-1">
            <span className="truncate font-medium">{shell.name}</span>
            <span className="truncate text-muted-foreground text-xs">{shell.email}</span>
            {roleLine ? (
              <span className="truncate text-[11px] text-muted-foreground capitalize">{roleLine}</span>
            ) : null}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            logout();
          }}
        >
          <LogOut className="size-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
