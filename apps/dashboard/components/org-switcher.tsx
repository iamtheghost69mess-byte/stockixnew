"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Building2, ChevronDown, Loader2, Pencil, PauseCircle } from "lucide-react";
import { toast } from "sonner";

import { formatApiError } from "@/lib/api-errors";
import { formatDate } from "@/lib/date-format";
import OrgStatusBadge from "@/components/org-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useOrganizations, type Organization } from "@/hooks/use-organizations";
import { cn } from "@/lib/utils";
import { validateOrganizationDisplayName } from "@/lib/validate-org-name";

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

function resolveOrgOpenUrl(org: Organization): string {
  const u = org.publicUrl?.trim();
  if (u) return u;
  const isLocal = org.subdomain.includes(".localhost");
  return `${isLocal ? "http" : "https"}://${org.subdomain}`;
}

function OrgMenuRow({
  org,
  primaryId,
  closeMenu,
  onRenameRequest,
  onSuspendRequest,
}: {
  org: Organization;
  primaryId: string | undefined;
  closeMenu: () => void;
  onRenameRequest: (org: Organization) => void;
  onSuspendRequest: (org: Organization) => void;
}) {
  const href = resolveOrgOpenUrl(org);
  const isPrimary = org.id === primaryId;

  if (org.status === "active") {
    return (
      <DropdownMenuGroup>
        <DropdownMenuLabel className="max-w-[220px] truncate font-medium text-foreground">{org.name}</DropdownMenuLabel>
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
  const [nameInput, setNameInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [renameOrg, setRenameOrg] = useState<Organization | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const [suspendOrg, setSuspendOrg] = useState<Organization | null>(null);
  const [suspendSaving, setSuspendSaving] = useState(false);

  const hasProvisioning = organizations.some((o) => o.status === "provisioning");
  const primaryId = organizations[0]?.id;

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
    setNameInput("");
  };

  const submitCreate = async () => {
    const nameErr = validateOrganizationDisplayName(nameInput);
    if (nameErr) {
      toast.error(nameErr);
      return;
    }
    const name = nameInput.trim();
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
  };

  const saveRename = async () => {
    if (!renameOrg) return;
    const nameErr = validateOrganizationDisplayName(renameValue);
    if (nameErr) {
      toast.error(nameErr);
      return;
    }
    const name = renameValue.trim();
    setRenameSaving(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/organizations/${renameOrg.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const json = await readJsonBody(res);
        toast.error(formatApiError(json, "Rename failed"));
        return;
      }
      toast.success("Renamed");
      setRenameOrg(null);
      await refetch(true);
    } finally {
      setRenameSaving(false);
    }
  };

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
                    primaryId={primaryId}
                    closeMenu={() => setMenuOpen(false)}
                    onRenameRequest={(o) => {
                      setRenameValue(o.name);
                      setRenameOrg(o);
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
                Each organization runs its own Bigcapital stack. Add one to get started.
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
              const isPrimary = org.id === primaryId;
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
                    {org.publicUrl ? (
                      <a
                        className="text-xs font-medium text-primary underline"
                        href={org.publicUrl}
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
                        setRenameValue(org.name);
                        setRenameOrg(org);
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
          <div className="space-y-2 py-2">
            <Label htmlFor="org-name">Organization name</Label>
            <Input
              id="org-name"
              placeholder="Organization name"
              maxLength={100}
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              disabled={submitting}
            />
            <p className="text-xs text-muted-foreground">2–100 characters. Avoid leading or trailing spaces.</p>
            <p className="text-sm text-muted-foreground">
              Currency, timezone, and regional settings will be inherited from your main organization.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDialog} disabled={submitting}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void submitCreate()}
              disabled={submitting || validateOrganizationDisplayName(nameInput) !== null}
            >
              {submitting ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renameOrg !== null} onOpenChange={(o) => !o && setRenameOrg(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename organization</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} maxLength={100} />
            <p className="text-xs text-muted-foreground">2–100 characters.</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameOrg(null)}>
              Cancel
            </Button>
            <Button
              disabled={renameSaving || validateOrganizationDisplayName(renameValue) !== null}
              onClick={() => void saveRename()}
            >
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
