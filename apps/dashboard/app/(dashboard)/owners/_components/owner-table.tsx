"use client";

import {
  Copy,
  Loader2,
  MoreHorizontal,
  Send,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";

import type { Me } from "@/hooks/use-me";
import { formatDate } from "@/lib/date-format";
import {
  ROLE,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  ROLES,
  type Role,
} from "@/lib/roles";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import type { Owner } from "./use-owners-page";

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) {
    const w = parts[0] ?? "";
    return w.slice(0, 2).toUpperCase() || "?";
  }
  const first = parts[0]?.[0] ?? "";
  const last = parts[parts.length - 1]?.[0] ?? "";
  const pair = `${first}${last}`.toUpperCase();
  return pair || "?";
}

function roleBadgeClass(role: Role) {
  const badgeClasses: Record<Role, string> = {
    [ROLE.SUPER_ADMIN]:
      "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-200",
    [ROLE.SUPPORT_AGENT]:
      "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-200",
    [ROLE.BILLING_MANAGER]:
      "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-200",
    [ROLE.READ_ONLY]: "border-muted-foreground/30 bg-muted text-muted-foreground",
  };
  return badgeClasses[role];
}

export type OwnerTableProps = {
  me: Me | null;
  canManageOwners: boolean;
  owners: Owner[];
  loading: boolean;
  loadErr: string;
  deleteErr: string;
  deletingId: string | null;
  deleteTarget: Owner | null;
  deleteConfirmEmail: string;
  onDeleteConfirmEmailChange: (value: string) => void;
  onDeleteOpenChange: (open: boolean) => void;
  onCancelDelete: () => void;
  onExecuteDelete: () => void;
  onOpenDelete: (owner: Owner) => void;
  onCopyOwnerId: (id: string) => void;
  onOpenRoleDialog: (owner: Owner, nextRole: Role) => void;
  resendingId: string | null;
  onResendInvitation: (owner: Owner) => void;
};

export function OwnerTable({
  me,
  canManageOwners,
  owners,
  loading,
  loadErr,
  deleteErr,
  deletingId,
  deleteTarget,
  deleteConfirmEmail,
  onDeleteConfirmEmailChange,
  onDeleteOpenChange,
  onCancelDelete,
  onExecuteDelete,
  onOpenDelete,
  onCopyOwnerId,
  onOpenRoleDialog,
  resendingId,
  onResendInvitation,
}: OwnerTableProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading owners…
      </div>
    );
  }

  if (loadErr) {
    return <p className="text-sm text-destructive">{loadErr}</p>;
  }

  return (
    <>
      <div className="rounded-lg border">
        {deleteErr ? (
          <p className="border-b px-4 py-2 text-sm text-destructive">{deleteErr}</p>
        ) : null}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Owner</TableHead>
              <TableHead className="min-w-[200px]">Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Member since</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {owners.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="p-0">
                  <EmptyState
                    icon={Users}
                    title="No team members found"
                    description="Invite a platform administrator using the button above."
                    className="border-0 bg-transparent"
                  />
                </TableCell>
              </TableRow>
            ) : (
              owners.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="whitespace-normal">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                        {initialsFromName(o.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {o.name}
                          {me?.id === o.id ? (
                            <span className="ml-2 rounded border px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                              You
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-muted-foreground">{o.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-normal align-top">
                    <span
                      className={`mb-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${roleBadgeClass(
                        o.role,
                      )}`}
                    >
                      {o.roleName ?? ROLE_LABELS[o.role]}
                    </span>
                    <p className="mb-2 text-[10px] text-muted-foreground">
                      Role changes take effect on next login
                    </p>
                    {canManageOwners ? (
                      <div className="space-y-1">
                        <Select
                          value={o.role}
                          onValueChange={(value) => {
                            const nextRole = value as Role;
                            if (nextRole === o.role) return;
                            onOpenRoleDialog(o, nextRole);
                          }}
                          disabled={me?.id === o.id}
                        >
                          <SelectTrigger className="h-8 w-full max-w-[220px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLES.map((role) => (
                              <SelectItem key={role} value={role}>
                                {ROLE_LABELS[role]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-[10px] text-muted-foreground">
                          {ROLE_DESCRIPTIONS[o.role]}
                        </p>
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          "font-medium shadow-none",
                          o.hasPassword
                            ? "border-emerald-600/45 bg-emerald-500/12 text-emerald-800 dark:border-emerald-400/50 dark:bg-emerald-500/15 dark:text-emerald-200"
                            : "border-red-600/45 bg-red-500/10 text-red-800 dark:border-red-400/50 dark:bg-red-500/15 dark:text-red-200",
                        )}
                      >
                        {o.hasPassword ? "Active" : "Pending invite"}
                      </Badge>
                      {!o.hasPassword && o.inviteTokenExpiresAt ? (
                        <p className="text-[10px] text-muted-foreground">
                          Expires {formatDate(o.inviteTokenExpiresAt)}
                        </p>
                      ) : null}
                      <TooltipProvider delay={200}>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <span
                                aria-label={o.mfaEnabled ? "MFA enabled" : "MFA not enabled"}
                                className="inline-flex"
                              />
                            }
                          >
                            {o.mfaEnabled ? (
                              <ShieldCheck className="h-4 w-4 text-emerald-500" />
                            ) : (
                              <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                            )}
                          </TooltipTrigger>
                          <TooltipContent>
                            {o.mfaEnabled ? "MFA enabled" : "MFA not enabled"}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(o.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label="Owner actions"
                          />
                        }
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => void onCopyOwnerId(o.id)}>
                          <Copy className="mr-2 h-4 w-4" />
                          Copy ID
                        </DropdownMenuItem>
                        {!o.hasPassword && canManageOwners ? (
                          <DropdownMenuItem
                            disabled={resendingId === o.id}
                            onClick={() => void onResendInvitation(o)}
                          >
                            <Send className="mr-2 h-4 w-4" />
                            {resendingId === o.id ? "Sending…" : "Resend invitation"}
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          disabled={me?.id === o.id || deletingId === o.id}
                          onClick={() => onOpenDelete(o)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Remove owner
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={onDeleteOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete owner</DialogTitle>
            <DialogDescription>
              Remove <strong>{deleteTarget?.name}</strong> ({deleteTarget?.email}). This fails if
              they still have tenants assigned. Type their email below to confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="delete-owner-email">
              Confirm email
            </label>
            <Input
              id="delete-owner-email"
              autoComplete="off"
              placeholder={deleteTarget?.email ?? ""}
              value={deleteConfirmEmail}
              onChange={(e) => onDeleteConfirmEmailChange(e.target.value)}
            />
            {deleteErr ? <p className="text-sm text-destructive">{deleteErr}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={onCancelDelete}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={
                !deleteTarget ||
                deletingId === deleteTarget.id ||
                deleteConfirmEmail.trim().toLowerCase() !== deleteTarget.email.toLowerCase()
              }
              onClick={() => void onExecuteDelete()}
            >
              {deletingId === deleteTarget?.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Delete owner"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
