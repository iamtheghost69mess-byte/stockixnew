"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import TenantStatusBadge from "@/components/tenant-status-badge";
import { formatApiError } from "@/lib/api-errors";
import type { LicenseRow } from "@/types/license";

type TenantOpt = { id: string; name: string; slug: string; status: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  license: LicenseRow;
  onSuccess: () => void;
  /** When set, tenant is fixed (e.g. assign from tenant detail page). */
  defaultTenantId?: string;
  defaultTenantLabel?: string;
};

export default function LicenseAssignDialog({
  open,
  onOpenChange,
  license,
  onSuccess,
  defaultTenantId,
  defaultTenantLabel,
}: Props) {
  const [tenants, setTenants] = useState<TenantOpt[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (defaultTenantId) {
      setTenantId(defaultTenantId);
      return;
    }
    setTenantId("");
    void (async () => {
      const res = await fetch("/api/tenants");
      const data = (await res.json().catch(() => ({}))) as {
        tenants?: {
          tenantId: string;
          name: string;
          slug: string;
          deploymentStatus?: string | null;
        }[];
      };
      if (!res.ok) return;
      const rows = (data.tenants ?? []).map((t) => ({
        id: t.tenantId,
        name: t.name,
        slug: t.slug,
        status: String(t.deploymentStatus ?? "unknown"),
      }));
      setTenants(rows);
    })();
  }, [open, defaultTenantId]);

  const submit = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/licenses/${license.id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (res.status === 409) {
        setError(formatApiError(data, data.message ?? "This license is already assigned."));
        return;
      }
      if (!res.ok) {
        setError(formatApiError(data, data.error ?? `Request failed (${res.status})`));
        return;
      }
      toast.success("License assigned to tenant.");
      onOpenChange(false);
      onSuccess();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign license</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>License key</Label>
            <p className="mt-1 font-mono text-sm">{license.licenseKey}</p>
          </div>
          <div>
            <Label>Tenant</Label>
            {defaultTenantId ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {defaultTenantLabel ?? defaultTenantId}
              </p>
            ) : (
              <Select
                value={tenantId}
                onValueChange={(v) => setTenantId(v ?? "")}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select tenant" />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="flex items-center gap-2">
                        {t.name}{" "}
                        <span className="text-muted-foreground">({t.slug})</span>{" "}
                        <TenantStatusBadge status={t.status} />
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!tenantId || loading} onClick={() => void submit()}>
            {loading ? "Assigning…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
