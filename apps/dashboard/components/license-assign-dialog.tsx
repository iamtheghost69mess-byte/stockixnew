"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "@/components/reusabletoast";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import { assignLicenseSchema, type AssignLicenseValues } from "@/lib/schemas";
import { moduleLabel, parseLicenseModules } from "@/lib/tenant-modules";
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

export function LicenseAssignDialog({
  open,
  onOpenChange,
  license,
  onSuccess,
  defaultTenantId,
  defaultTenantLabel,
}: Props) {
  const [tenants, setTenants] = useState<TenantOpt[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assignForm = useForm<AssignLicenseValues>({
    resolver: zodResolver(assignLicenseSchema),
    defaultValues: { tenantId: "", notes: undefined },
    mode: "onTouched",
  });

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (defaultTenantId) {
      assignForm.reset({ tenantId: defaultTenantId, notes: undefined });
      return;
    }
    assignForm.reset({ tenantId: "", notes: undefined });
    void (async () => {
      const res = await fetch("/api/tenants?page=1&pageSize=1000");
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

  const handleDialogOpenChange = (next: boolean) => {
    if (!next) {
      assignForm.reset({ tenantId: "", notes: undefined });
      setError(null);
    }
    onOpenChange(next);
  };

  const onAssignSubmit = assignForm.handleSubmit(async (values) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/licenses/${license.id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: values.tenantId }),
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
      assignForm.reset({ tenantId: "", notes: undefined });
      handleDialogOpenChange(false);
      onSuccess();
    } finally {
      setLoading(false);
    }
  });

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign license</DialogTitle>
        </DialogHeader>
        <Form {...assignForm}>
          <form
            id="license-assign-form"
            className="space-y-3"
            noValidate
            onSubmit={(e) => void onAssignSubmit(e)}
          >
            <div>
              <Label>License key</Label>
              <p className="mt-1 font-mono text-sm">{license.licenseKey}</p>
            </div>
            <div>
              <Label>Licensed modules</Label>
              <p className="mt-1 text-sm text-muted-foreground">
                {parseLicenseModules(license.modules ?? ["accounting"])
                  .map((mod) => moduleLabel(mod))
                  .join(", ")}
              </p>
            </div>
            {defaultTenantId ? (
              <div>
                <Label>Tenant</Label>
                <p className="mt-1 text-sm text-muted-foreground">
                  {defaultTenantLabel ?? defaultTenantId}
                </p>
              </div>
            ) : (
              <FormField
                control={assignForm.control}
                name="tenantId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tenant</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select tenant" />
                        </SelectTrigger>
                      </FormControl>
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
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </form>
        </Form>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => handleDialogOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="license-assign-form" disabled={loading}>
            {loading ? "Assigning…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
