"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";

import { toast } from "@/components/reusabletoast";
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
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useOrganizations, type Organization } from "@/hooks/use-organizations";

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

function OrgMenuRow({ org }: { org: Organization }) {
  const href = resolveOrgOpenUrl(org);
  if (org.status === "active") {
    return (
      <DropdownMenuItem
        onClick={() => {
          window.open(href, "_blank", "noopener,noreferrer");
        }}
      >
        {org.name}
      </DropdownMenuItem>
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
    setNameInput("");
  };

  const submitCreate = async () => {
    const name = nameInput.trim();
    if (!name) return;
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
        toast.success(
          "Organization is being provisioned. This may take a few minutes.",
        );
        return;
      }
      if (res.status === 402) {
        toast.error("Upgrade your plan to add more organizations.");
        return;
      }
      const message =
        typeof json.message === "string"
          ? json.message
          : typeof json.error === "string"
            ? json.error
            : "Failed to create organization.";
      toast.error(message);
    } catch {
      toast.error("Failed to create organization.");
    } finally {
      setSubmitting(false);
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
              {organizations.map((org) => (
                <OrgMenuRow key={org.id} org={org} />
              ))}
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
        {organizations.length > 0 && !isLoading ? (
          <ul className="mt-2 max-w-md space-y-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
            {organizations.map((org) => (
              <li key={org.id} className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
                <span className="font-medium">{org.name}</span>
                <span className="font-mono text-xs text-muted-foreground">{org.slug}</span>
                <span className="text-xs text-muted-foreground">{org.subdomain}</span>
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
                <Badge variant="outline" className="w-fit text-[10px]">
                  {org.status}
                </Badge>
              </li>
            ))}
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
            <DialogDescription>
              A new Bigcapital instance will be provisioned.
            </DialogDescription>
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
            <p className="text-sm text-muted-foreground">
              Currency, timezone, and regional settings will be inherited from your main organization.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDialog} disabled={submitting}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void submitCreate()} disabled={submitting || !nameInput.trim()}>
              {submitting ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
