"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, PauseCircle, PlayCircle, Square, Trash2 } from "lucide-react";
import { toast } from "@/components/reusabletoast";

import { Button } from "@repo/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@repo/ui/dialog";
import { Input } from "@repo/ui/input";
import { TenantSlugConfirmField } from "../../_components/tenant-slug-confirm-field";
import { formatApiError } from "@/lib/api-errors";
import type { TenantDetail } from "@/types/tenant";

import { readJson } from "./tenant-detail-utils";

export type TenantDangerZoneProps = {
  tenant: TenantDetail;
  isProvisioning: boolean;
  stopProvisionOpen: boolean;
  onStopProvisionOpenChange: (open: boolean) => void;
  onReload: () => Promise<void>;
  onReloadEvents: () => Promise<void>;
  onError: (message: string) => void;
};

export function TenantDangerZone({
  tenant,
  isProvisioning,
  stopProvisionOpen,
  onStopProvisionOpenChange,
  onReload,
  onReloadEvents,
  onError,
}: TenantDangerZoneProps) {
  const router = useRouter();
  const [dangerOpen, setDangerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [volumesOpen, setVolumesOpen] = useState(false);
  const [confirmSlug, setConfirmSlug] = useState("");
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [suspendConfirmSlug, setSuspendConfirmSlug] = useState("");
  const [suspendingTenant, setSuspendingTenant] = useState(false);
  const [reactivateDialogOpen, setReactivateDialogOpen] = useState(false);
  const [reactivatingTenant, setReactivatingTenant] = useState(false);
  const [stopProvisionSlugInput, setStopProvisionSlugInput] = useState("");
  const [stoppingProvision, setStoppingProvision] = useState(false);
  const [deletingTenant, setDeletingTenant] = useState(false);

  const runTenantDelete = async (wipeVolumes: boolean) => {
    setDeletingTenant(true);
    onError("");
    try {
      const query = wipeVolumes ? "?volumes=true" : "";
      const res = await fetch(`/api/tenants/${tenant.id}${query}`, { method: "DELETE" });
      const body = await readJson(res);
      const data = body as { error?: string; message?: string; hardDeleted?: boolean; accepted?: boolean };
      if (!res.ok && res.status !== 404) {
        onError(formatApiError(body, data.message ?? data.error ?? `Delete failed (${res.status})`));
        return;
      }
      toast.success(
        data.hardDeleted
          ? `Tenant "${tenant.slug}" deleted.`
          : `Tenant "${tenant.slug}" removal started. Docker cleanup may take up to a minute.`,
      );
      setVolumesOpen(false);
      setConfirmOpen(false);
      setConfirmSlug("");
      router.push("/tenants");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingTenant(false);
    }
  };

  const openStopProvision = () => {
    setStopProvisionSlugInput("");
    onStopProvisionOpenChange(true);
  };

  return (
    <>
      <Card className="border-destructive/40">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Danger Zone</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setDangerOpen((v) => !v)}>
            {dangerOpen ? "Hide" : "Show"}
          </Button>
        </CardHeader>
        {dangerOpen ? (
          <CardContent className="space-y-4">
            {tenant.status === "active" || tenant.status === "partial" ? (
              <Button variant="outline" onClick={() => setSuspendOpen(true)}>
                <PauseCircle className="mr-1 h-4 w-4" />
                Suspend tenant
              </Button>
            ) : null}
            {tenant.status === "suspended" ? (
              <Button onClick={() => setReactivateDialogOpen(true)}>
                <PlayCircle className="mr-1 h-4 w-4" />
                Reactivate tenant
              </Button>
            ) : null}
            {isProvisioning ? (
              <Button
                variant="outline"
                disabled={stoppingProvision}
                onClick={openStopProvision}
              >
                {stoppingProvision ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Square className="mr-1 h-4 w-4" />
                )}
                Stop provisioning
              </Button>
            ) : null}
            <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
              <Trash2 className="mr-1 h-4 w-4" />
              Delete tenant
            </Button>
          </CardContent>
        ) : null}
      </Card>

      <Dialog
        open={reactivateDialogOpen}
        onOpenChange={setReactivateDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reactivate tenant?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will restart the Docker stack for {tenant.name} and make it accessible again.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReactivateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={reactivatingTenant}
              onClick={async () => {
                setReactivatingTenant(true);
                onError("");
                try {
                  const res = await fetch(`/api/tenants/${tenant.id}/reactivate`, { method: "POST" });
                  if (!res.ok) {
                    const body = await readJson(res);
                    const data = body as { error?: string };
                    onError(formatApiError(body, data.error ?? `Reactivate failed (${res.status})`));
                    return;
                  }
                  toast.success("Tenant reactivated");
                  setReactivateDialogOpen(false);
                  await onReload();
                } finally {
                  setReactivatingTenant(false);
                }
              }}
            >
              {reactivatingTenant ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Reactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={suspendOpen}
        onOpenChange={(open) => {
          setSuspendOpen(open);
          if (!open) setSuspendConfirmSlug("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspend tenant</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Docker stacks for this tenant and its organizations will be stopped. Type the tenant slug{" "}
            <span className="font-mono font-medium text-foreground">{tenant.slug}</span> to confirm.
          </p>
          <Input
            placeholder="Tenant slug"
            value={suspendConfirmSlug}
            onChange={(e) => setSuspendConfirmSlug(e.target.value)}
            autoComplete="off"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSuspendOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={suspendConfirmSlug !== tenant.slug || suspendingTenant}
              onClick={async () => {
                if (suspendConfirmSlug !== tenant.slug) return;
                setSuspendingTenant(true);
                onError("");
                try {
                  const res = await fetch(`/api/tenants/${tenant.id}/suspend`, { method: "POST" });
                  if (!res.ok) {
                    const body = await readJson(res);
                    const data = body as { error?: string };
                    onError(formatApiError(body, data.error ?? `Suspend failed (${res.status})`));
                    return;
                  }
                  toast.success("Suspend requested");
                  setSuspendOpen(false);
                  setSuspendConfirmSlug("");
                  router.push("/tenants");
                } finally {
                  setSuspendingTenant(false);
                }
              }}
            >
              {suspendingTenant ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Suspend
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Are you absolutely sure?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete {tenant.name} and all its data. Copy the tenant slug below and paste it into
            the confirmation field to continue.
          </p>
          <TenantSlugConfirmField
            slug={tenant.slug}
            value={confirmSlug}
            onChange={setConfirmSlug}
            inputId="danger-zone-delete-slug-confirm"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={confirmSlug !== tenant.slug}
              onClick={() => {
                setConfirmOpen(false);
                setVolumesOpen(true);
              }}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={volumesOpen}
        onOpenChange={(open) => {
          if (!open && deletingTenant) return;
          setVolumesOpen(open);
          if (!open) setConfirmSlug("");
        }}
      >
        <DialogContent showCloseButton={!deletingTenant}>
          {deletingTenant ? (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <Loader2 className="size-10 animate-spin text-primary" aria-hidden />
              <DialogHeader className="space-y-2 text-center sm:text-center">
                <DialogTitle>Deleting tenant</DialogTitle>
              </DialogHeader>
              <p className="max-w-sm text-sm text-muted-foreground">
                Queuing removal for <span className="font-mono">{tenant.slug}</span>…
              </p>
              <p className="text-xs text-muted-foreground">
                Docker cleanup continues in the background after the request is accepted.
              </p>
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Also delete Docker volumes?</DialogTitle>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => void runTenantDelete(false)}>
                  Keep volumes
                </Button>
                <Button variant="destructive" onClick={() => void runTenantDelete(true)}>
                  Delete volumes
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={stopProvisionOpen}
        onOpenChange={(open) => {
          onStopProvisionOpenChange(open);
          if (!open) setStopProvisionSlugInput("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stop provisioning</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This cancels the active provisioning lifecycle job for{" "}
            <span className="font-mono font-medium text-foreground">{tenant.slug}</span>. Type the tenant slug to
            confirm.
          </p>
          <Input
            placeholder="Tenant slug"
            value={stopProvisionSlugInput}
            onChange={(e) => setStopProvisionSlugInput(e.target.value)}
            autoComplete="off"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => onStopProvisionOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={stopProvisionSlugInput !== tenant.slug || stoppingProvision}
              onClick={async () => {
                if (stopProvisionSlugInput !== tenant.slug) return;
                setStoppingProvision(true);
                onError("");
                try {
                  const res = await fetch(`/api/tenants/${tenant.id}/provision-stop`, {
                    method: "POST",
                  });
                  const data = (await readJson(res)) as {
                    error?: string;
                    status?: string;
                  };
                  if (!res.ok) {
                    onError(formatApiError(data, data.error ?? `Stop provisioning failed (${res.status})`));
                    return;
                  }
                  await onReload();
                  await onReloadEvents();
                  toast.success(`Provision stop requested (${data.status ?? "ok"}).`);
                  onStopProvisionOpenChange(false);
                  setStopProvisionSlugInput("");
                } finally {
                  setStoppingProvision(false);
                }
              }}
            >
              {stoppingProvision ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Stop provisioning
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
