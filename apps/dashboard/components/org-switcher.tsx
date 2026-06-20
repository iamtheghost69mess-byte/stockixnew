"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, ChevronDown, Loader2, Pencil, PauseCircle } from "lucide-react";
import { toast } from "@/components/reusabletoast";

import { formatApiError } from "@/lib/api-errors";
import { formatDate } from "@/lib/date-format";
import OrgStatusBadge from "@/components/org-status-badge";
import { Badge } from "@repo/ui/badge";
import { Button, buttonVariants } from "@repo/ui/button";
import { Card, CardContent } from "@repo/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/dropdown-menu";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@repo/ui/form";
import { Input } from "@repo/ui/input";
import { Skeleton } from "@repo/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@repo/ui/tooltip";
import { useOrganizations, type Organization } from "@/hooks/use-organizations";
import { cn } from "@/lib/utils";
import { createOrgSchema, renameOrgSchema, type CreateOrgValues, type RenameOrgValues } from "@/lib/schemas";

interface OrgSwitcherProps {
  tenantId: string;
}

async function readJsonBody(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

function resolveOrgOpenUrl(org: Organization, allOrgs: Organization[]): string {
  // Always use the primary organization's URL to access the Finance instance,
  // since all sub-organizations share the same container and domain.
  const targetOrg = allOrgs.find((o) => o.isPrimary) ?? org;
  const u = targetOrg.publicUrl?.trim();
  if (u) return u;
  const isLocal = targetOrg.subdomain.includes(".localhost");
  return `${isLocal ? "http" : "https"}://${targetOrg.subdomain}`;
}

function OrgMenuRow({
  org,
  allOrgs,
  closeMenu,
  onRenameRequest,
  onSuspendRequest,
}: {
  org: Organization;
  allOrgs: Organization[];
  closeMenu: () => void;
  onRenameRequest: (org: Organization) => void;
  onSuspendRequest: (org: Organization) => void;
}) {
  const href = resolveOrgOpenUrl(org, allOrgs);
  const isPrimary = org.isPrimary;

  if (org.status === "active") {
    return (
      <DropdownMenuGroup>
        <DropdownMenuLabel className="flex w-full max-w-[220px] items-center gap-2 font-medium text-foreground">
          <span className="min-w-0 truncate">{org.name}</span>
          {org.isPrimary ? (
            <Badge variant="secondary" className="ml-auto shrink-0 text-xs">
              Primary
            </Badge>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            closeMenu();
            window.open(href, "_blank", "noopener,noreferrer");
          }}
        >
          Open in new tab
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            closeMenu();
            onRenameRequest(org);
          }}
        >
          <Pencil className="mr-2 size-4 opacity-70" />
          Rename
        </DropdownMenuItem>
        {!isPrimary ? (
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              closeMenu();
              onSuspendRequest(org);
            }}
          >
            <PauseCircle className="mr-2 size-4 opacity-70" />
            Suspend
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuGroup>
    );
  }

  if (org.status === "provisioning") {
    return (
      <DropdownMenuItem disabled className="opacity-100">
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate">{org.name}</span>
          {org.isPrimary ? (
            <Badge variant="secondary" className="ml-auto shrink-0 text-xs">
              Primary
            </Badge>
          ) : null}
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
        </span>
      </DropdownMenuItem>
    );
  }

  if (org.status === "suspended") {
    return (
      <DropdownMenuItem disabled className="opacity-100">
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate">{org.name}</span>
          {org.isPrimary ? (
            <Badge variant="secondary" className="ml-auto shrink-0 text-xs">
              Primary
            </Badge>
          ) : null}
          <Badge variant="secondary" className="shrink-0">
            Suspended
          </Badge>
        </span>
      </DropdownMenuItem>
    );
  }

  const err = org.provisioningError?.trim() ?? "Provisioning failed";
  return (
    <DropdownMenuItem disabled className="pointer-events-auto opacity-100">
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="flex min-w-0 flex-1 cursor-default items-center gap-2 outline-none">
              <span className="truncate">{org.name}</span>
              {org.isPrimary ? (
                <Badge variant="secondary" className="ml-auto shrink-0 text-xs">
                  Primary
                </Badge>
              ) : null}
              <Badge variant="destructive" className="shrink-0">
                Failed
              </Badge>
            </span>
          }
        />
        <TooltipContent side="left" className="max-w-xs">
          {err}
        </TooltipContent>
      </Tooltip>
    </DropdownMenuItem>
  );
}

export function OrgSwitcher({ tenantId }: OrgSwitcherProps) {
  const { organizations, isLoading, error, refetch } = useOrganizations(tenantId);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [renameOrg, setRenameOrg] = useState<Organization | null>(null);
  const [renameSaving, setRenameSaving] = useState(false);
  const [suspendOrg, setSuspendOrg] = useState<Organization | null>(null);
  const [suspendSaving, setSuspendSaving] = useState(false);

  const orgForm = useForm<CreateOrgValues>({
    resolver: zodResolver(createOrgSchema),
    defaultValues: { name: "" },
    mode: "onTouched",
  });

  const renameForm = useForm<RenameOrgValues>({
    resolver: zodResolver(renameOrgSchema),
    defaultValues: { name: "" },
    mode: "onTouched",
  });

  const hasProvisioning = organizations.some((o) => o.status === "provisioning");

  useEffect(() => {
    if (!hasProvisioning) return;
    const id = window.setInterval(() => {
      void refetch(true);
    }, 5000);
    return () => window.clearInterval(id);
  }, [hasProvisioning, refetch]);

  const openAddDialog = () => {
    setMenuOpen(false);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    orgForm.reset();
  };

  const onOrgSubmit = orgForm.handleSubmit(async (values) => {
    const name = values.name.trim();
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/organizations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await readJsonBody(res);
      if (res.status === 201) {
        closeDialog();
        await refetch(true);
        toast.success("Organization is being provisioned. This may take a few minutes.");
        return;
      }
      if (res.status === 402) {
        toast.error(formatApiError(json, "Upgrade your plan to add more organizations."));
        return;
      }
      toast.error(formatApiError(json, "Failed to create organization."));
    } catch {
      toast.error("Failed to create organization.");
    } finally {
      setSubmitting(false);
    }
  });

  const onRenameSubmit = renameForm.handleSubmit(async (values) => {
    if (!renameOrg) return;
    const name = values.name.trim();
    setRenameSaving(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/organizations/${renameOrg.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await readJsonBody(res);
      if (!res.ok) {
        toast.error(formatApiError(json, "Rename failed"));
        return;
      }
      if (json.syncWarning) {
        toast.warning(`Renamed. ${json.syncWarning as string}`);
      } else {
        toast.success("Renamed");
      }
      setRenameOrg(null);
      renameForm.reset({ name: "" });
      await refetch(true);
    } finally {
      setRenameSaving(false);
    }
  });

  const confirmSuspend = async () => {
    if (!suspendOrg) return;
    setSuspendSaving(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/organizations/${suspendOrg.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "suspended" }),
      });
      const j = await readJsonBody(res);
      if (!res.ok) {
        toast.error(formatApiError(j, "Suspend failed"));
        return;
      }
      toast.success("Organization suspended");
      setSuspendOrg(null);
      await refetch(true);
    } finally {
      setSuspendSaving(false);
    }
  };

  const count = organizations.length;
  const triggerLabel = isLoading ? "Organizations" : `Organizations (${count})`;

  return (
    <TooltipProvider delay={200}>
      <div className="flex flex-col gap-2">
        {isLoading ? (
          <Skeleton className="h-9 w-[200px]" />
        ) : (
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger
              render={<Button variant="outline" className="w-[200px] justify-between" />}
            >
              {triggerLabel}
              <ChevronDown className="size-4 shrink-0 opacity-60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[220px]">
              {organizations.flatMap((org, i) => {
                const row = (
                  <OrgMenuRow
                    key={org.id}
                    org={org}
                    allOrgs={organizations}
                    closeMenu={() => setMenuOpen(false)}
                    onRenameRequest={(o) => {
                      setRenameOrg(o);
                      renameForm.reset({ name: o.name });
                    }}
                    onSuspendRequest={(o) => setSuspendOrg(o)}
                  />
                );
                const sep =
                  i < organizations.length - 1 ? (
                    <DropdownMenuSeparator key={`__sep-${org.id}`} />
                  ) : null;
                return sep ? [row, sep] : [row];
              })}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  openAddDialog();
                }}
              >
                + Add Organization
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {!isLoading && organizations.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center py-10 text-center">
              <div className="mb-3 flex size-10 items-center justify-center rounded-full border bg-muted/50">
                <Building2 className="size-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">No sub-organizations yet</p>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                Additional organizations share your tenant&apos;s Finance instance. Add one
                to get started.
              </p>
              <Button type="button" className="mt-4" variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
                Add organization
              </Button>
            </CardContent>
          </Card>
        ) : null}
        {organizations.length > 0 && !isLoading ? (
          <ul className="mt-2 max-w-md space-y-3 rounded-md border border-border bg-muted/30 p-3 text-sm">
            {organizations.map((org) => {
              const isPrimary = org.isPrimary;
              return (
                <li
                  key={org.id}
                  className="flex flex-col gap-2 rounded-md border border-border/60 bg-background/80 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{org.name}</span>
                      <OrgStatusBadge status={org.status} />
                      {isPrimary ? (
                        <Badge variant="outline" className="text-[10px] font-semibold uppercase tracking-wide">
                          Primary
                        </Badge>
                      ) : null}
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">{org.slug}</span>
                    <span className="block text-xs text-muted-foreground">{org.subdomain}</span>
                    <span className="block text-xs text-muted-foreground">
                      Created {formatDate(org.createdAt)}
                    </span>
                    {org.provisioningError ? (
                      <span className="block text-xs text-amber-600 dark:text-amber-400">
                        COA copy: {org.provisioningError}
                      </span>
                    ) : null}
                    {org.status === "active" ? (
                      <a
                        className="text-xs font-medium text-primary underline"
                        href={resolveOrgOpenUrl(org, organizations)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open app
                      </a>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Link
                      href={`/tenants/${tenantId}/organizations/${org.id}`}
                      className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "inline-flex items-center")}
                    >
                      Details
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setRenameOrg(org);
                        renameForm.reset({ name: org.name });
                      }}
                    >
                      <Pencil className="mr-1 size-3.5" />
                      Rename
                    </Button>
                    {!isPrimary && org.status === "active" ? (
                      <Button variant="ghost" size="sm" onClick={() => setSuspendOrg(org)}>
                        <PauseCircle className="mr-1 size-3.5" />
                        Suspend
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDialog();
          else setDialogOpen(true);
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Add Organization</DialogTitle>
            <p className="text-sm text-muted-foreground">A new Bigcapital instance will be provisioned.</p>
          </DialogHeader>
          <Form {...orgForm}>
            <form
              id="org-create-form"
              onSubmit={(e) => void onOrgSubmit(e)}
              className="space-y-2 py-2"
              noValidate
            >
              <FormField
                control={orgForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Organization name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Organization name"
                        maxLength={100}
                        disabled={submitting}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription className="text-xs">
                      2–100 characters. Avoid leading or trailing spaces.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <p className="text-sm text-muted-foreground">
                Currency, timezone, and regional settings will be inherited from your main organization.
              </p>
            </form>
          </Form>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDialog} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" form="org-create-form" disabled={submitting}>
              {submitting ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={renameOrg !== null}
        onOpenChange={(o) => {
          if (!o) {
            setRenameOrg(null);
            renameForm.reset({ name: "" });
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename organization</DialogTitle>
          </DialogHeader>
          <Form {...renameForm}>
            <form
              id="org-rename-form"
              className="space-y-2 py-2"
              noValidate
              onSubmit={(e) => void onRenameSubmit(e)}
            >
              <FormField
                control={renameForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Organization name" maxLength={100} disabled={renameSaving} {...field} />
                    </FormControl>
                    <FormDescription className="text-xs">2–100 characters.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setRenameOrg(null);
                renameForm.reset({ name: "" });
              }}
            >
              Cancel
            </Button>
            <Button type="submit" form="org-rename-form" disabled={renameSaving}>
              {renameSaving ? <Loader2 className="size-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={suspendOrg !== null} onOpenChange={(o) => !o && setSuspendOrg(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspend organization</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Stop the stack for <span className="font-medium">{suspendOrg?.name}</span>? This cannot target the
            primary organization.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSuspendOrg(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={suspendSaving} onClick={() => void confirmSuspend()}>
              {suspendSaving ? <Loader2 className="size-4 animate-spin" /> : "Suspend"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
