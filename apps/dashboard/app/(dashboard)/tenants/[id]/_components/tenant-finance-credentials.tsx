"use client";

import { useState } from "react";
import { Copy, Loader2 } from "lucide-react";
import { toast } from "@/components/reusabletoast";

import { Alert, AlertDescription } from "@repo/ui/alert";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/card";
import { formatApiError } from "@/lib/api-errors";
import type { TenantDetail } from "@/types/tenant";

import { readJson } from "./tenant-detail-utils";

export type TenantFinanceCredentialsProps = {
  tenant: TenantDetail;
  baseUrl: string | null;
  isSuper: boolean;
  onTenantReload: () => Promise<void>;
};

export function TenantFinanceCredentials({
  tenant,
  baseUrl,
  isSuper,
  onTenantReload,
}: TenantFinanceCredentialsProps) {
  const [clearingFinancePassword, setClearingFinancePassword] = useState(false);

  const clearFinancePassword = async () => {
    setClearingFinancePassword(true);
    try {
      const res = await fetch(`/api/tenants/${tenant.id}/finance-password`, {
        method: "DELETE",
      });
      const body = await readJson(res);
      if (!res.ok) {
        throw new Error(formatApiError(body, "Could not clear Finance credentials"));
      }
      toast.success("Finance credentials cleared from dashboard");
      await onTenantReload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not clear Finance credentials");
    } finally {
      setClearingFinancePassword(false);
    }
  };

  const hasAccountingModule = (tenant.modules ?? []).includes("accounting");
  const deploymentActive =
    (tenant.deployment?.status ?? "").toLowerCase() === "active";
  const hasPassword = Boolean(tenant.deployment?.financeAdminPassword);

  if (!hasAccountingModule || !deploymentActive || !hasPassword) {
    return null;
  }

  return (
    <Card className="md:col-span-3">
      <CardHeader>
        <CardTitle>Finance admin credentials</CardTitle>
        <CardDescription>
          This password works until the admin logs in and changes it. After first login it is
          permanently invalidated. Clear it from the dashboard once the tenant admin confirms
          they can sign in.
          {isSuper ? " Super admins can use Impersonate for support access." : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground">Email</p>
            <p className="mt-1 font-mono text-xs">{tenant.adminEmail}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label="Copy admin email"
            onClick={() => {
              void navigator.clipboard.writeText(tenant.adminEmail);
              toast.success("Copied admin email");
            }}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground">Temporary password</p>
            <p className="mt-1 break-all font-mono text-xs">
              {tenant.deployment!.financeAdminPassword}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label="Copy temporary password"
            onClick={() => {
              void navigator.clipboard.writeText(tenant.deployment!.financeAdminPassword!);
              toast.success("Copied temporary password");
            }}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
        {tenant.deployment!.publicUrl || baseUrl ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground">Login URL</p>
              <p className="mt-1 break-all font-mono text-xs">
                {tenant.deployment!.publicUrl ?? baseUrl}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8 shrink-0"
              aria-label="Copy login URL"
              onClick={() => {
                const url = tenant.deployment?.publicUrl ?? baseUrl ?? "";
                void navigator.clipboard.writeText(url);
                toast.success("Copied login URL");
              }}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : null}
        <Alert>
          <AlertDescription>
            Clear this password from the dashboard manually after the tenant admin confirms
            they have logged in.
          </AlertDescription>
        </Alert>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={clearingFinancePassword}
          onClick={() => void clearFinancePassword()}
        >
          {clearingFinancePassword ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : null}
          Mark credentials as delivered — clear from dashboard
        </Button>
      </CardContent>
    </Card>
  );
}
