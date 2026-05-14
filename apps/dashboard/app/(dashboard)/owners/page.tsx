"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Copy,
  Loader2,
  MoreHorizontal,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "@/components/reusabletoast";

import { useMe } from "@/hooks/use-me";
import { formatApiError } from "@/lib/api-errors";
import { formatDate } from "@/lib/date-format";
import {
  ROLE,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  ROLES,
  type Role,
} from "@/lib/roles";
import { inviteOwnerSchema, type InviteOwnerValues } from "@/lib/schemas";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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

type Owner = {
  id: string;
  email: string;
  name: string;
  role: Role;
  hasPassword?: boolean;
  mfaEnabled: boolean;
  createdAt: string;
};

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

export default function OwnersPage() {
  const me = useMe();
  const canManageOwners = Boolean(me?.capabilities.canManageOwners);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loadErr, setLoadErr] = useState("");
  const [loading, setLoading] = useState(true);

  const [adding, setAdding] = useState(false);
  const [addErr, setAddErr] = useState("");

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteErr, setDeleteErr] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const inviteForm = useForm<InviteOwnerValues>({
    resolver: zodResolver(inviteOwnerSchema),
    defaultValues: { email: "", name: "", role: ROLE.READ_ONLY },
  });

  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [roleChangeTarget, setRoleChangeTarget] = useState<{
    owner: Owner;
    nextRole: Role;
  } | null>(null);
  const [roleSaving, setRoleSaving] = useState(false);
  const [roleErr, setRoleErr] = useState("");
  const [roleSuccess, setRoleSuccess] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<Owner | null>(null);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr("");
    try {
      const res = await fetch("/api/owners");
      const dataUnknown = await res.json().catch(() => ({}));
      const data = dataUnknown as {
        owners?: Array<Partial<Owner> & { id: string; email: string; name: string; role: Role; createdAt: string }>;
        error?: string;
      };
      if (!res.ok) throw new Error(formatApiError(dataUnknown, data.error ?? `HTTP ${res.status}`));
      const parsed: Owner[] = (data.owners ?? []).map((o) => ({
        id: o.id,
        email: o.email,
        name: o.name,
        role: o.role,
        hasPassword: o.hasPassword,
        mfaEnabled: o.mfaEnabled ?? false,
        createdAt: o.createdAt,
      }));
      setOwners(parsed);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onInviteSubmit = inviteForm.handleSubmit(async (values) => {
    setAddErr("");
    setAdding(true);
    try {
      const res = await fetch("/api/owners/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: values.email,
          name: values.name,
          role: values.role,
        }),
      });
      const data = (await res.json()) as {
        owner?: Owner;
        inviteUrl?: string;
        error?: string;
      };
      if (!res.ok) {
        setAddErr(formatApiError(data, data.error ?? `HTTP ${res.status}`));
        return;
      }
      setInviteUrl(data.inviteUrl ?? "");
      setCopiedInvite(false);
      setInviteOpen(false);
      inviteForm.reset();
      await load();
    } catch (e) {
      setAddErr(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  });

  async function copyInviteUrl() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedInvite(true);
      window.setTimeout(() => setCopiedInvite(false), 2000);
    } catch {
      setAddErr("Could not copy invite link.");
    }
  }

  async function copyOwnerId(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      toast.success("Copied owner ID");
    } catch {
      toast.error("Could not copy");
    }
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

  async function applyRoleChange() {
    if (!roleChangeTarget) return;
    setRoleSaving(true);
    setRoleErr("");
    setRoleSuccess("");
    try {
      const res = await fetch(`/api/owners/${roleChangeTarget.owner.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: roleChangeTarget.nextRole }),
      });
      const data = (await res.json()) as {
        error?: string;
        message?: string;
        owner?: Owner;
      };
      if (!res.ok) {
        setRoleErr(formatApiError(data, data.message ?? data.error ?? `HTTP ${res.status}`));
        return;
      }
      if (data.owner) {
        setOwners((prev) =>
          prev.map((o) =>
            o.id === data.owner!.id ? { ...o, role: data.owner!.role } : o,
          ),
        );
      } else {
        await load();
      }
      setRoleSuccess("Role updated successfully.");
      setRoleDialogOpen(false);
      setRoleChangeTarget(null);
    } catch (e) {
      setRoleErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRoleSaving(false);
    }
  }

  async function executeDelete() {
    if (!deleteTarget) return;
    if (deleteConfirmEmail.trim().toLowerCase() !== deleteTarget.email.toLowerCase()) {
      return;
    }
    setDeleteErr("");
    setDeletingId(deleteTarget.id);
    try {
      const res = await fetch(`/api/owners/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const dataUnknown = await res.json().catch(() => ({}));
      const data = dataUnknown as { error?: string; detail?: string };
      if (!res.ok) {
        setDeleteErr(
          formatApiError(dataUnknown, data.detail ?? data.error ?? `HTTP ${res.status}`),
        );
        return;
      }
      setDeleteTarget(null);
      setDeleteConfirmEmail("");
      await load();
    } catch (e) {
      setDeleteErr(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Team & access</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div>
        <h1 className="text-xl font-semibold">Owners</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Platform administrators who can have tenants assigned to them.
        </p>
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Invite platform admins with role-based access.
          </p>
          <Button
            type="button"
            className="gap-2"
            onClick={() => setInviteOpen(true)}
            disabled={!canManageOwners}
          >
            <Plus className="h-4 w-4" />
            Invite owner
          </Button>
        </div>
        {addErr && <p className="text-sm text-destructive">{addErr}</p>}
        {roleErr ? (
          <Alert variant="destructive">
            <AlertDescription>{roleErr}</AlertDescription>
          </Alert>
        ) : null}
        {roleSuccess ? (
          <Alert>
            <AlertDescription>{roleSuccess}</AlertDescription>
          </Alert>
        ) : null}
        {inviteUrl && (
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground break-all">
              Invite link: {inviteUrl}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => void copyInviteUrl()}
            >
              <Copy className="mr-1 h-3 w-3" />
              {copiedInvite ? "Copied" : "Copy"}
            </Button>
          </div>
        )}
      </div>

      <Dialog
        open={inviteOpen}
        onOpenChange={(open) => {
          setInviteOpen(open);
          if (!open) {
            inviteForm.reset();
            setAddErr("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite team member</DialogTitle>
            <DialogDescription>
              Send an invitation to a new owner. They will receive an email to set up their account.
            </DialogDescription>
          </DialogHeader>
          <Form {...inviteForm}>
            <form
              id="owners-invite-form"
              onSubmit={(e) => void onInviteSubmit(e)}
              className="grid gap-4"
              noValidate
            >
              <FormField
                control={inviteForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium text-muted-foreground">
                      Email
                    </FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="owner@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={inviteForm.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium text-muted-foreground">
                      Role
                    </FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(value) => field.onChange(value as Role)}
                    >
                      <FormControl>
                        <SelectTrigger className="h-9 w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ROLES.map((role) => (
                          <SelectItem key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={inviteForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium text-muted-foreground">
                      Name
                    </FormLabel>
                    <FormControl>
                      <Input type="text" placeholder="Full name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setInviteOpen(false);
                inviteForm.reset();
                setAddErr("");
              }}
            >
              Cancel
            </Button>
            <Button type="submit" form="owners-invite-form" disabled={adding} className="gap-2">
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Send invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading owners…
        </div>
      ) : loadErr ? (
        <p className="text-sm text-destructive">{loadErr}</p>
      ) : (
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
                  <TableCell colSpan={5} className="py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Users className="h-8 w-8 text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground">No team members found.</p>
                      <p className="text-xs text-muted-foreground">Invite an admin using the button above.</p>
                    </div>
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
                        {ROLE_LABELS[o.role]}
                      </span>
                      <p className="mb-2 text-[10px] text-muted-foreground">Role changes take effect on next login</p>
                      {canManageOwners ? (
                        <div className="space-y-1">
                          <Select
                            value={o.role}
                            onValueChange={(value) => {
                              const nextRole = value as Role;
                              if (nextRole === o.role) return;
                              setRoleChangeTarget({ owner: o, nextRole });
                              setRoleDialogOpen(true);
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
                          <p className="text-[10px] text-muted-foreground">{ROLE_DESCRIPTIONS[o.role]}</p>
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant={o.hasPassword ? "default" : "secondary"}>
                          {o.hasPassword ? "Active" : "Pending invite"}
                        </Badge>
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
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Owner actions" />
                          }
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => void copyOwnerId(o.id)}>
                            <Copy className="mr-2 h-4 w-4" />
                            Copy ID
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            disabled={me?.id === o.id || deletingId === o.id}
                            onClick={() => {
                              setDeleteTarget(o);
                              setDeleteConfirmEmail("");
                              setDeleteErr("");
                            }}
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
      )}

      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {roleChangeTarget
                ? `Change role for ${roleChangeTarget.owner.name}?`
                : "Change role"}
            </DialogTitle>
          </DialogHeader>
          {roleChangeTarget ? (
            <div className="space-y-2 text-sm">
              <p>
                You are changing their role from{" "}
                <strong>{ROLE_LABELS[roleChangeTarget.owner.role]}</strong> to{" "}
                <strong>{ROLE_LABELS[roleChangeTarget.nextRole]}</strong>.
              </p>
              <p className="text-muted-foreground">
                {ROLE_DESCRIPTIONS[roleChangeTarget.nextRole]}
              </p>
              <p className="text-xs text-muted-foreground">
                This takes effect on their next login.
              </p>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setRoleDialogOpen(false);
                setRoleChangeTarget(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={() => void applyRoleChange()} disabled={roleSaving}>
              {roleSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteConfirmEmail("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete owner</DialogTitle>
            <DialogDescription>
              Remove <strong>{deleteTarget?.name}</strong> ({deleteTarget?.email}). This fails if they
              still have tenants assigned. Type their email below to confirm.
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
              onChange={(e) => setDeleteConfirmEmail(e.target.value)}
            />
            {deleteErr ? <p className="text-sm text-destructive">{deleteErr}</p> : null}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setDeleteTarget(null);
                setDeleteConfirmEmail("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={
                !deleteTarget ||
                deletingId === deleteTarget.id ||
                deleteConfirmEmail.trim().toLowerCase() !== deleteTarget.email.toLowerCase()
              }
              onClick={() => void executeDelete()}
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
    </div>
  );
}
