"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useHasPermission } from "@/hooks/use-permissions";
import { format } from "date-fns";
import { Copy, History } from "lucide-react";
import { toast } from "@/components/reusabletoast";

import { LicenseAssignDialog } from "@/components/license-assign-dialog";
import LicenseGenerateDialog from "@/components/license-generate-dialog";
import { LicenseExtendDialog } from "@/components/license-extend-dialog";
import LicenseStatusBadge from "@/components/license-status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatApiError } from "@/lib/api-errors";
import { formatDate } from "@/lib/date-format";
import { moduleLabel } from "@/lib/tenant-modules";
import { cn } from "@/lib/utils";
import type { LicenseRow, LicenseStatus } from "@/types/license";
import type { TenantDetail } from "@/types/tenant";

import { asStockixModuleId, readJson } from "./tenant-detail-utils";

export type TenantLicensePanelProps = {
  tenant: TenantDetail;
  tenantId: string;
  isSuper: boolean;
  reloadToken?: number;
};

export function TenantLicensePanel({
  tenant,
  tenantId,
  isSuper,
  reloadToken = 0,
}: TenantLicensePanelProps) {
  const [tenantLicense, setTenantLicense] = useState<LicenseRow | null>(null);
  const [licenseLoading, setLicenseLoading] = useState(true);
  const [genLicenseOpen, setGenLicenseOpen] = useState(false);
  const [revokeLicenseOpen, setRevokeLicenseOpen] = useState(false);
  const [extendLicenseOpen, setExtendLicenseOpen] = useState(false);
  const [revokeLicenseReason, setRevokeLicenseReason] = useState("");
  const [assignPickOpen, setAssignPickOpen] = useState(false);
  const [unassignedPickLoading, setUnassignedPickLoading] = useState(false);
  const [unassignedList, setUnassignedList] = useState<LicenseRow[]>([]);
  const [selectedUnassignedId, setSelectedUnassignedId] = useState("");
  const [licenseForAssign, setLicenseForAssign] = useState<LicenseRow | null>(null);
  const [assignLicenseOpen, setAssignLicenseOpen] = useState(false);
  const [licenseHistory, setLicenseHistory] = useState<LicenseRow[]>([]);
  const [licenseHistoryLoading, setLicenseHistoryLoading] = useState(false);
  const [licenseHistoryOpen, setLicenseHistoryOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");
  const [reactivateOpen, setReactivateOpen] = useState(false);
  const canSuspend = useHasPermission("licenses.suspend");

  const loadLicense = async () => {
    setLicenseLoading(true);
    try {
      const res = await fetch(
        `/api/licenses?tenantId=${encodeURIComponent(tenantId)}&pageSize=1&primary=1`,
      );
      const data = (await readJson(res)) as { licenses?: LicenseRow[] };
      if (res.ok && data.licenses?.[0]) setTenantLicense(data.licenses[0]!);
      else setTenantLicense(null);
    } finally {
      setLicenseLoading(false);
    }
  };

  const loadLicenseHistory = useCallback(async () => {
    setLicenseHistoryLoading(true);
    try {
      const res = await fetch(`/api/licenses?tenantId=${encodeURIComponent(tenantId)}&pageSize=50`);
      const data = (await readJson(res)) as { licenses?: LicenseRow[] };
      if (res.ok) setLicenseHistory(data.licenses ?? []);
      else setLicenseHistory([]);
    } finally {
      setLicenseHistoryLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void loadLicense();
  }, [tenantId, reloadToken]);

  useEffect(() => {
    if (!licenseHistoryOpen) return;
    void loadLicenseHistory();
  }, [licenseHistoryOpen, loadLicenseHistory]);

  useEffect(() => {
    if (!assignPickOpen || !isSuper) return;
    setUnassignedPickLoading(true);
    void (async () => {
      try {
        const res = await fetch("/api/licenses?status=unassigned&pageSize=100");
        const data = (await readJson(res)) as { licenses?: LicenseRow[] };
        if (res.ok && data.licenses?.length) {
          setUnassignedList(data.licenses);
          setSelectedUnassignedId(data.licenses[0]!.id);
        } else {
          setUnassignedList([]);
          setSelectedUnassignedId("");
        }
      } finally {
        setUnassignedPickLoading(false);
      }
    })();
  }, [assignPickOpen, isSuper]);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>License</CardTitle>
          <CardDescription>Software license assigned to this tenant</CardDescription>
        </CardHeader>
        <CardContent>
          {licenseLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : tenantLicense ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm">{tenantLicense.licenseKey}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        void navigator.clipboard.writeText(tenantLicense.licenseKey);
                        toast.success("Copied");
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <LicenseStatusBadge status={tenantLicense.status as LicenseStatus} />
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">
                      {tenantLicense.product === "pos_desktop"
                        ? "POS Desktop"
                        : tenantLicense.product === "bundle"
                          ? "Bundle"
                          : "Platform"}
                    </Badge>
                    <Badge variant="secondary" className="capitalize">
                      {tenantLicense.planSlug}
                    </Badge>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <p>
                    Valid from:{" "}
                    {tenantLicense.validFrom
                      ? format(new Date(tenantLicense.validFrom), "PP")
                      : tenantLicense.activatedAt
                        ? format(new Date(tenantLicense.activatedAt), "PP")
                        : "—"}
                  </p>
                  <p>
                    Expires:{" "}
                    {tenantLicense.isPerpetual ? (
                      <Badge variant="secondary">Perpetual — no expiry</Badge>
                    ) : tenantLicense.expiresAt ? (
                      <>
                        {format(new Date(tenantLicense.expiresAt), "PP")}
                        {(() => {
                          const days = Math.ceil(
                            (new Date(tenantLicense.expiresAt!).getTime() - Date.now()) /
                              (1000 * 60 * 60 * 24),
                          );
                          if (days > 0 && days <= 30 && tenantLicense.status === "active") {
                            return (
                              <Badge variant="destructive" className="ml-2">
                                Expires in {days} day{days === 1 ? "" : "s"}
                              </Badge>
                            );
                          }
                          return null;
                        })()}
                      </>
                    ) : (
                      "—"
                    )}
                  </p>
                  {tenantLicense.modules && tenantLicense.modules.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-muted-foreground">License modules:</span>
                      {tenantLicense.modules.map((mod) => (
                        <Badge key={mod} variant="outline" className="capitalize">
                          {moduleLabel(asStockixModuleId(mod))}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  <p>
                    Activations:{" "}
                    {tenantLicense.product === "platform"
                      ? "—"
                      : `${tenantLicense.activationCount} / ${tenantLicense.maxActivations}`}
                  </p>
                  <p>Grace period: {tenantLicense.gracePeriodDays} days</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                <Link
                  href={`/licenses/${tenantLicense.id}`}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "inline-flex",
                  )}
                >
                  View full license details
                </Link>
                {isSuper && tenantLicense.status === "active" ? (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setExtendLicenseOpen(true)}>
                      Extend
                    </Button>
                    {canSuspend ? (
                      <Button variant="outline" size="sm" onClick={() => setSuspendOpen(true)}>
                        Suspend
                      </Button>
                    ) : null}
                    <Button variant="outline" size="sm" onClick={() => setRevokeLicenseOpen(true)}>
                      Revoke
                    </Button>
                  </>
                ) : null}
                {canSuspend &&
                tenantLicense &&
                (tenantLicense.status === "suspended" || tenantLicense.status === "expired") ? (
                  <Button variant="outline" size="sm" onClick={() => setReactivateOpen(true)}>
                    Reactivate
                  </Button>
                ) : null}
              </div>
              <div className="border-t pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto px-0 text-muted-foreground hover:text-foreground"
                  onClick={() => setLicenseHistoryOpen((o) => !o)}
                >
                  <History className="mr-1 h-4 w-4" />
                  {licenseHistoryOpen ? "Hide" : "Show"} license history
                  {licenseHistory.length > 0 ? ` (${licenseHistory.length})` : null}
                </Button>
                {licenseHistoryOpen ? (
                  licenseHistoryLoading ? (
                    <Skeleton className="mt-3 h-24 w-full" />
                  ) : licenseHistory.length === 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">No license rows returned for this tenant.</p>
                  ) : (
                    <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto text-xs">
                      {licenseHistory.map((lic) => (
                        <li key={lic.id} className="flex flex-wrap items-center justify-between gap-2 rounded border bg-muted/20 p-2">
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono">{lic.licenseKey.slice(-12)}…</span>
                              <LicenseStatusBadge status={lic.status as LicenseStatus} />
                            </div>
                            <p className="text-muted-foreground">
                              {lic.planSlug} · created {formatDate(lic.createdAt)}
                              {lic.id === tenantLicense.id ? " · current" : ""}
                            </p>
                          </div>
                          <Link
                            href={`/licenses/${lic.id}`}
                            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")}
                          >
                            Open
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )
                ) : null}
              </div>
            </div>
          ) : (
            <Alert className="border-amber-500/40 bg-amber-500/10">
              <AlertTitle>No license assigned</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>This tenant does not have an active license.</p>
                {isSuper ? (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => setGenLicenseOpen(true)}>
                      Generate &amp; assign license
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setAssignPickOpen(true);
                      }}
                    >
                      Assign existing license
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm">Ask a super admin to generate or assign a license.</p>
                )}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <LicenseGenerateDialog
        open={genLicenseOpen}
        onOpenChange={setGenLicenseOpen}
        defaultTenantId={tenant.id}
        onSuccess={() => void loadLicense()}
      />

      <LicenseExtendDialog
        open={extendLicenseOpen}
        onOpenChange={setExtendLicenseOpen}
        licenseId={tenantLicense?.id ?? null}
        onSuccess={() => void loadLicense()}
      />

      <Dialog open={revokeLicenseOpen} onOpenChange={setRevokeLicenseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke license</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Reason (optional)"
            value={revokeLicenseReason}
            onChange={(e) => setRevokeLicenseReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRevokeLicenseOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!tenantLicense}
              onClick={async () => {
                if (!tenantLicense) return;
                const res = await fetch(`/api/licenses/${tenantLicense.id}/revoke`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ reason: revokeLicenseReason || undefined }),
                });
                if (!res.ok) {
                  const data = (await readJson(res)) as { error?: string };
                  toast.error(formatApiError(data, "Revoke failed"));
                  return;
                }
                toast.success("License revoked");
                setRevokeLicenseOpen(false);
                setRevokeLicenseReason("");
                void loadLicense();
              }}
            >
              Revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={assignPickOpen}
        onOpenChange={(open) => {
          setAssignPickOpen(open);
          if (!open) setSelectedUnassignedId("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign existing license</DialogTitle>
          </DialogHeader>
          {unassignedPickLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : unassignedList.length === 0 ? (
            <Alert>
              <AlertDescription>There are no unassigned licenses. Generate one first.</AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-2">
              <Label>Unassigned license</Label>
              <Select
                value={selectedUnassignedId}
                onValueChange={(v) => setSelectedUnassignedId(v ?? "")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a license" />
                </SelectTrigger>
                <SelectContent>
                  {unassignedList.map((lic) => (
                    <SelectItem key={lic.id} value={lic.id}>
                      <span className="font-mono text-xs">{lic.licenseKey}</span>{" "}
                      <span className="text-muted-foreground">({lic.planSlug})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAssignPickOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!selectedUnassignedId || unassignedList.length === 0}
              onClick={() => {
                const lic = unassignedList.find((l) => l.id === selectedUnassignedId);
                if (!lic) return;
                setLicenseForAssign(lic);
                setAssignPickOpen(false);
                setAssignLicenseOpen(true);
              }}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={suspendOpen} onOpenChange={setSuspendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspend license</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="tenant-suspend-reason">Reason (optional)</Label>
            <Input
              id="tenant-suspend-reason"
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSuspendOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!tenantLicense) return;
                void (async () => {
                  const res = await fetch(`/api/licenses/${tenantLicense.id}/suspend`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ reason: suspendReason || undefined }),
                  });
                  const body = await readJson(res);
                  if (!res.ok) {
                    toast.error(formatApiError(body, "Suspend failed"));
                    return;
                  }
                  const data = body as { errors?: string[]; financeSync?: string; posSync?: string };
                  if (data.errors?.length) {
                    toast.warning(`License suspended with sync warnings: ${data.errors.join("; ")}`);
                  } else {
                    toast.success("License suspended");
                  }
                  setSuspendOpen(false);
                  setSuspendReason("");
                  void loadLicense();
                })();
              }}
            >
              Suspend
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reactivateOpen} onOpenChange={setReactivateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reactivate license</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReactivateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!tenantLicense) return;
                void (async () => {
                  const res = await fetch(`/api/licenses/${tenantLicense.id}/reactivate`, {
                    method: "POST",
                  });
                  const body = await readJson(res);
                  if (!res.ok) {
                    toast.error(formatApiError(body, "Reactivate failed"));
                    return;
                  }
                  toast.success("License reactivated");
                  setReactivateOpen(false);
                  void loadLicense();
                })();
              }}
            >
              Reactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {licenseForAssign ? (
        <LicenseAssignDialog
          open={assignLicenseOpen}
          onOpenChange={(open) => {
            setAssignLicenseOpen(open);
            if (!open) setLicenseForAssign(null);
          }}
          license={licenseForAssign}
          defaultTenantId={tenant.id}
          defaultTenantLabel={`${tenant.name} (${tenant.slug})`}
          onSuccess={() => {
            void loadLicense();
            setLicenseForAssign(null);
            setAssignLicenseOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
