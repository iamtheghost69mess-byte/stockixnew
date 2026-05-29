"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Building2,
  Copy,
  ExternalLink,
  Loader2,
  MoreHorizontalIcon,
  PauseCircle,
  PlayCircle,
  SearchIcon,
  Square,
  Trash2Icon,
} from "lucide-react";

import TenantStatusBadge from "@/components/tenant-status-badge";
import LicenseStatusBadge from "@/components/license-status-badge";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { tenantPublicBaseUrl } from "@/lib/tenant-url";
import { formatDateTime } from "@/lib/date-format";
import type { TenantDirectoryTotals, TenantRow } from "@/types/tenant";
import type { LicenseStatus } from "@/types/license";

function parseLicenseStatus(raw: string | null | undefined): LicenseStatus | null {
  if (
    raw === "active"
    || raw === "expired"
    || raw === "revoked"
    || raw === "unassigned"
    || raw === "suspended"
  ) {
    return raw;
  }
  return null;
}

type StatusFilter = "all" | "active" | "partial" | "suspended" | "provisioning" | "failed";
export type TenantSortOrder = "newest" | "oldest" | "name_asc" | "name_desc";

type Props = {
  tenants: TenantRow[];
  /** Directory-wide counts (child-org filter only). Null before first load. */
  directoryTotals: TenantDirectoryTotals | null;
  listLoading: boolean;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (value: StatusFilter) => void;
  sortOrder: TenantSortOrder;
  onSortOrderChange: (value: TenantSortOrder) => void;
  onRequestDelete: (tenantId: string, slug: string) => void;
  onSuspend: (tenantId: string, slug: string) => Promise<boolean>;
  onReactivate: (tenantId: string, slug: string) => Promise<boolean>;
  onStopProvision: (tenantId: string, slug: string) => Promise<boolean>;
  deletingId: string | null;
  suspendingId: string | null;
  reactivatingId: string | null;
  stoppingId: string | null;
  onAddTenant?: () => void;
};

export function TenantList(props: Props) {
  const {
    tenants,
    directoryTotals,
    listLoading,
    searchQuery,
    onSearchQueryChange,
    statusFilter,
    onStatusFilterChange,
    sortOrder,
    onSortOrderChange,
    onRequestDelete,
    onSuspend,
    onReactivate,
    onStopProvision,
    deletingId,
    suspendingId,
    reactivatingId,
    stoppingId,
    onAddTenant,
  } = props;
  const router = useRouter();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<{ tenantId: string; slug: string } | null>(null);
  const [suspendSlugInput, setSuspendSlugInput] = useState("");
  const [reactivateTarget, setReactivateTarget] = useState<{ tenantId: string; slug: string; name: string } | null>(
    null,
  );
  const [stopProvisionTarget, setStopProvisionTarget] = useState<{ tenantId: string; slug: string } | null>(
    null,
  );
  const [stopProvisionSlugInput, setStopProvisionSlugInput] = useState("");

  const counts = useMemo(() => {
    if (directoryTotals) {
      return {
        total: directoryTotals.total,
        active: directoryTotals.active,
        suspended: directoryTotals.suspended,
      };
    }
    return { total: 0, active: 0, suspended: 0 };
  }, [directoryTotals]);

  const clearFilters = () => {
    onSearchQueryChange("");
    onStatusFilterChange("all");
  };

  const copyText = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 2000);
  };

  if (directoryTotals && directoryTotals.total === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center py-16 text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-full border bg-muted/50">
            <Building2 className="size-6 text-muted-foreground" />
          </div>
          <h3 className="text-base font-semibold">No tenants yet</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Provision your first customer organization to appear in this directory.
          </p>
          {onAddTenant ? (
            <Button type="button" className="mt-6" onClick={onAddTenant}>
              Add tenant
            </Button>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Dialog
        open={suspendTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSuspendTarget(null);
            setSuspendSlugInput("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspend tenant</DialogTitle>
          </DialogHeader>
          {suspendTarget ? (
            <>
              <p className="text-sm text-muted-foreground">
                Stacks for this tenant will be stopped. Type the slug{" "}
                <span className="font-mono font-medium text-foreground">{suspendTarget.slug}</span> to confirm.
              </p>
              <Input
                placeholder="Tenant slug"
                value={suspendSlugInput}
                onChange={(e) => setSuspendSlugInput(e.target.value)}
                autoComplete="off"
              />
              <DialogFooter>
                <Button variant="ghost" onClick={() => setSuspendTarget(null)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={suspendSlugInput !== suspendTarget.slug || suspendingId === suspendTarget.tenantId}
                  onClick={() => {
                    void (async () => {
                      if (suspendSlugInput !== suspendTarget.slug) return;
                      const ok = await onSuspend(suspendTarget.tenantId, suspendTarget.slug);
                      if (ok) {
                        setSuspendTarget(null);
                        setSuspendSlugInput("");
                      }
                    })();
                  }}
                >
                  {suspendingId === suspendTarget.tenantId ? (
                    <Loader2 className="mr-1 size-4 animate-spin" />
                  ) : null}
                  Suspend
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog
        open={reactivateTarget !== null}
        onOpenChange={(open) => {
          if (!open) setReactivateTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reactivateTarget ? `Reactivate ${reactivateTarget.name}?` : "Reactivate tenant?"}
            </DialogTitle>
          </DialogHeader>
          {reactivateTarget ? (
            <>
              <p className="text-sm text-muted-foreground">The tenant&apos;s stack will be restarted.</p>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setReactivateTarget(null)}>
                  Cancel
                </Button>
                <Button
                  disabled={reactivatingId === reactivateTarget.tenantId}
                  onClick={() => {
                    void (async () => {
                      const ok = await onReactivate(reactivateTarget.tenantId, reactivateTarget.slug);
                      if (ok) setReactivateTarget(null);
                    })();
                  }}
                >
                  {reactivatingId === reactivateTarget.tenantId ? (
                    <Loader2 className="mr-1 size-4 animate-spin" />
                  ) : null}
                  Reactivate
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog
        open={stopProvisionTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setStopProvisionTarget(null);
            setStopProvisionSlugInput("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stop provisioning</DialogTitle>
          </DialogHeader>
          {stopProvisionTarget ? (
            <>
              <p className="text-sm text-muted-foreground">
                This cancels the active provisioning lifecycle job for{" "}
                <span className="font-mono font-medium text-foreground">{stopProvisionTarget.slug}</span>. Type
                that slug to confirm.
              </p>
              <Input
                placeholder="Tenant slug"
                value={stopProvisionSlugInput}
                onChange={(e) => setStopProvisionSlugInput(e.target.value)}
                autoComplete="off"
              />
              <DialogFooter>
                <Button variant="ghost" onClick={() => setStopProvisionTarget(null)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={
                    stopProvisionSlugInput !== stopProvisionTarget.slug ||
                    stoppingId === stopProvisionTarget.tenantId
                  }
                  onClick={() => {
                    void (async () => {
                      if (stopProvisionSlugInput !== stopProvisionTarget.slug) return;
                      const ok = await onStopProvision(stopProvisionTarget.tenantId, stopProvisionTarget.slug);
                      if (ok) {
                        setStopProvisionTarget(null);
                        setStopProvisionSlugInput("");
                      }
                    })();
                  }}
                >
                  {stoppingId === stopProvisionTarget.tenantId ? (
                    <Loader2 className="mr-1 size-4 animate-spin" />
                  ) : null}
                  Stop provisioning
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      <div className="flex flex-col gap-3 rounded-xl border border-border/80 bg-muted/20 p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{counts.total}</span> organizations ·{" "}
          <span className="font-medium text-foreground">{counts.active}</span> active ·{" "}
          <span className="font-medium text-foreground">{counts.suspended}</span> suspended
        </p>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              placeholder="Search name, slug, or email…"
              className="h-9 pl-9"
              aria-label="Filter tenants"
            />
          </div>
          <Select value={sortOrder} onValueChange={(v) => onSortOrderChange(v as TenantSortOrder)}>
            <SelectTrigger className="h-9 w-full sm:w-[160px]">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="name_asc">Name A→Z</SelectItem>
              <SelectItem value="name_desc">Name Z→A</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="mr-1 self-center text-xs font-medium text-muted-foreground">Status:</span>
        {(["all", "active", "partial", "suspended", "provisioning", "failed"] as const).map((status) => (
          <Badge
            key={status}
            variant={statusFilter === status ? "default" : "outline"}
            className="cursor-pointer rounded-md px-2.5 py-0.5 text-xs font-normal capitalize"
            onClick={() => onStatusFilterChange(status)}
          >
            {status}
          </Badge>
        ))}
      </div>

      <div className="w-full overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="min-w-[200px] pl-4 whitespace-normal">Organization</TableHead>
              <TableHead className="whitespace-normal">Admin</TableHead>
              <TableHead title="Deployment status (Docker stack) and tenant record status (e.g. partial bundle)">
                Status
              </TableHead>
              <TableHead className="hidden sm:table-cell">License</TableHead>
              <TableHead className="hidden md:table-cell" title="Active license expiry date">
                Expires
              </TableHead>
              <TableHead className="hidden lg:table-cell" title="When the tenant row was created in Stockix">
                Created
              </TableHead>
              <TableHead
                className="hidden xl:table-cell"
                title="When provisioning finished (registration completed)"
              >
                Provisioned
              </TableHead>
              <TableHead className="hidden min-w-[140px] whitespace-normal lg:table-cell">
                Public URL
              </TableHead>
              <TableHead className="w-[56px] pr-4 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listLoading && tenants.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={9}
                  className="py-12 text-center text-sm text-muted-foreground"
                >
                  Loading tenants…
                </TableCell>
              </TableRow>
            ) : null}
            {!listLoading || tenants.length > 0 ? (
              <>
                {tenants.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={9}
                      className="h-[min(50vh,22rem)] align-top whitespace-normal px-4 py-10 md:py-14"
                    >
                      <div className="flex max-w-lg flex-col gap-3 text-left">
                        <p className="text-sm font-medium text-foreground">No matching tenants</p>
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          No organizations match the current search or status filter. Try another status,
                          clear the search, or reset all filters.
                        </p>
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Button type="button" variant="secondary" size="sm" onClick={clearFilters}>
                            Clear filters
                          </Button>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : null}
                {tenants.length > 0
                  ? tenants.map((t) => {
                const tenantStatus = (t.tenantStatus ?? "").toLowerCase();
                const deploymentStatus = (t.deploymentStatus ?? "unknown").toLowerCase();
                const status =
                  tenantStatus === "partial"
                    ? "partial"
                    : deploymentStatus;
                const canSuspend =
                  (tenantStatus === "active" || tenantStatus === "partial")
                  && deploymentStatus !== "suspended";
                const publicOrigin = tenantPublicBaseUrl(t.slug, t.internalPort);
                const canOpen = deploymentStatus === "active" && Boolean(publicOrigin);
                const loginHref = publicOrigin ? `${publicOrigin}/auth/login` : null;
                const busy =
                  deletingId === t.tenantId ||
                  suspendingId === t.tenantId ||
                  reactivatingId === t.tenantId ||
                  stoppingId === t.tenantId;

                return (
                  <TableRow
                    key={t.tenantId}
                    className={cn(
                      "group",
                      deletingId === t.tenantId && "bg-muted/40 opacity-60",
                    )}
                  >
                    <TableCell className="max-w-[260px] pl-4 align-top whitespace-normal">
                      <div className="flex flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium leading-snug">{t.name}</span>
                          {t.lastError ? (
                            <span
                              className="inline-flex size-2 rounded-full bg-amber-500"
                              title={t.lastError}
                              aria-label="Has error — see detail page"
                            />
                          ) : null}
                        </div>
                        <code className="text-xs text-muted-foreground">{t.slug}</code>
                        {t.lastError ? (
                          <Alert variant="destructive" className="mt-2 py-2">
                            <AlertDescription className="text-xs leading-snug">
                              {t.lastError.slice(0, 160)}
                              {t.lastError.length > 160 ? "…" : ""}
                            </AlertDescription>
                          </Alert>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="align-top whitespace-normal">
                      <span className="break-all text-sm">{t.adminEmail}</span>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex flex-wrap items-center gap-2">
                        <TenantStatusBadge status={status} />
                        {deletingId === t.tenantId ? (
                          <Badge variant="secondary" className="gap-1">
                            <Loader2 className="size-3 animate-spin" aria-hidden />
                            Deleting…
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="hidden align-top sm:table-cell">
                      {parseLicenseStatus(t.licenseStatus) ? (
                        <LicenseStatusBadge status={parseLicenseStatus(t.licenseStatus)!} />
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden align-top text-muted-foreground md:table-cell">
                      {t.licenseIsPerpetual
                        ? "Perpetual"
                        : t.licenseExpiresAt
                          ? formatDateTime(t.licenseExpiresAt)
                          : "—"}
                    </TableCell>
                    <TableCell className="hidden align-top text-muted-foreground lg:table-cell">
                      {t.createdAt ? formatDateTime(t.createdAt) : "—"}
                    </TableCell>
                    <TableCell className="hidden align-top text-muted-foreground xl:table-cell">
                      {t.registrationCompletedAt ? formatDateTime(t.registrationCompletedAt) : "—"}
                    </TableCell>
                    <TableCell className="hidden max-w-[200px] align-top lg:table-cell">
                      <span className="break-all font-mono text-xs text-muted-foreground">
                        {publicOrigin ?? "—"}
                      </span>
                      {t.internalPort != null ? (
                        <span className="mt-1 block text-xs text-muted-foreground">
                          Port {t.internalPort}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="pr-4 text-right align-top">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="h-8 w-8"
                              disabled={busy}
                            />
                          }
                        >
                          <MoreHorizontalIcon className="size-4" />
                          <span className="sr-only">Actions for {t.name}</span>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem onClick={() => router.push(`/tenants/${t.tenantId}`)}>
                            View details
                          </DropdownMenuItem>
                          {canOpen && loginHref ? (
                            <DropdownMenuItem
                              onClick={() => window.open(loginHref, "_blank", "noopener,noreferrer")}
                            >
                              <ExternalLink className="size-4" />
                              Open tenant login
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem
                            disabled={!publicOrigin}
                            onClick={() => {
                              if (publicOrigin) void copyText(`origin-${t.tenantId}`, publicOrigin);
                            }}
                          >
                            <Copy className="size-4" />
                            {copiedKey === `origin-${t.tenantId}` ? "Copied URL" : "Copy public URL"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {canSuspend ? (
                            <DropdownMenuItem
                              onClick={() => {
                                setSuspendSlugInput("");
                                setSuspendTarget({ tenantId: t.tenantId, slug: t.slug });
                              }}
                            >
                              {suspendingId === t.tenantId ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <PauseCircle className="size-4" />
                              )}
                              Suspend
                            </DropdownMenuItem>
                          ) : null}
                          {deploymentStatus === "suspended" ? (
                            <DropdownMenuItem
                              onClick={() => {
                                setReactivateTarget({ tenantId: t.tenantId, slug: t.slug, name: t.name });
                              }}
                            >
                              {reactivatingId === t.tenantId ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <PlayCircle className="size-4" />
                              )}
                              Reactivate
                            </DropdownMenuItem>
                          ) : null}
                          {deploymentStatus === "provisioning" || deploymentStatus === "pending" ? (
                            <DropdownMenuItem
                              onClick={() => {
                                setStopProvisionSlugInput("");
                                setStopProvisionTarget({ tenantId: t.tenantId, slug: t.slug });
                              }}
                            >
                              {stoppingId === t.tenantId ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <Square className="size-4" />
                              )}
                              Stop provisioning
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => onRequestDelete(t.tenantId, t.slug)}
                          >
                            {deletingId === t.tenantId ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Trash2Icon className="size-4" />
                            )}
                            Delete tenant
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
                  })
                  : null}
              </>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
