"use client";

import { useState } from "react";
import { ExternalLink, Loader2, RotateCw, UserCheck } from "lucide-react";
import { toast } from "@/components/reusabletoast";

import TenantStatusBadge from "@/components/tenant-status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatApiError } from "@/lib/api-errors";
import { formatDateTime } from "@/lib/date-format";
import type { TenantDetail } from "@/types/tenant";

import { readJson } from "./tenant-detail-utils";

export type TenantInfrastructureCardProps = {
  tenant: TenantDetail;
  baseUrl: string | null;
  posUrl: string | null;
  isSuper: boolean;
  provisionFailed: boolean;
  onReload: () => Promise<void>;
  onReloadEvents: () => Promise<void>;
  onError: (message: string) => void;
};

export function TenantInfrastructureCard({
  tenant,
  baseUrl,
  posUrl,
  isSuper,
  provisionFailed,
  onReload,
  onReloadEvents,
  onError,
}: TenantInfrastructureCardProps) {
  const [retryingProvision, setRetryingProvision] = useState(false);
  const [impersonating, setImpersonating] = useState(false);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Infrastructure</CardTitle>
        <div className="flex flex-wrap gap-2">
          {provisionFailed ? (
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={retryingProvision}
              onClick={async () => {
                setRetryingProvision(true);
                onError("");
                try {
                  const res = await fetch(`/api/tenants/${tenant.id}/retry-provision`, {
                    method: "POST",
                  });
                  const data = (await readJson(res)) as { error?: string; message?: string };
                  if (!res.ok) {
                    onError(formatApiError(data, data.message ?? data.error ?? `HTTP ${res.status}`));
                    return;
                  }
                  toast.success("Provisioning restarted");
                  await onReload();
                  await onReloadEvents();
                } finally {
                  setRetryingProvision(false);
                }
              }}
            >
              {retryingProvision ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <RotateCw className="mr-1 h-4 w-4" />
              )}
              Retry provisioning
            </Button>
          ) : null}
          {tenant.deployment?.status === "active" && (baseUrl || posUrl) ? (
            <>
              {baseUrl ? (
                <a
                  href={`${baseUrl}/auth/login`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonVariants({ size: "sm" })}
                >
                  <ExternalLink className="mr-1 h-4 w-4" />
                  Finance login
                </a>
              ) : null}
              {posUrl ? (
                <a
                  href={posUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonVariants({ size: "sm", variant: "outline" })}
                >
                  <ExternalLink className="mr-1 h-4 w-4" />
                  Open POS
                </a>
              ) : null}
              {isSuper ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={impersonating}
                  onClick={async () => {
                    setImpersonating(true);
                    try {
                      const res = await fetch(`/api/tenants/${tenant.id}/impersonate`, {
                        method: "POST",
                      });
                      const data = (await readJson(res)) as {
                        error?: string;
                        message?: string;
                        impersonatePostUrl?: string;
                        token?: string;
                      };
                      if (!res.ok) {
                        toast.error(data.message ?? "Failed to impersonate tenant");
                        return;
                      }
                      if (!data.impersonatePostUrl || !data.token) {
                        toast.error("Failed to impersonate tenant");
                        return;
                      }
                      const tab = window.open("about:blank", "_blank", "noopener");
                      if (!tab) {
                        toast.error("Popup blocked by browser");
                        return;
                      }
                      const form = tab.document.createElement("form");
                      form.method = "POST";
                      form.action = data.impersonatePostUrl;
                      const tokenInput = tab.document.createElement("input");
                      tokenInput.type = "hidden";
                      tokenInput.name = "t";
                      tokenInput.value = data.token;
                      form.appendChild(tokenInput);
                      tab.document.body.appendChild(form);
                      form.submit();
                      toast.success("Impersonation session opened in new tab");
                    } catch {
                      toast.error("Failed to impersonate tenant");
                    } finally {
                      setImpersonating(false);
                    }
                  }}
                >
                  {impersonating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <UserCheck className="mr-2 h-4 w-4" />
                  )}
                  Impersonate
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <TenantStatusBadge
          status={
            tenant.status === "partial"
              ? tenant.status
              : (tenant.deployment?.status ?? tenant.status)
          }
        />
        <p>
          Internal port:{" "}
          <span className="font-mono">{tenant.deployment?.internalPort ?? "-"}</span>
        </p>
        <p>
          Compose project:{" "}
          <span className="font-mono">{tenant.deployment?.composeProjectName ?? "-"}</span>
        </p>
        <p>
          Registration completed:{" "}
          {tenant.deployment?.registrationCompletedAt
            ? formatDateTime(tenant.deployment.registrationCompletedAt)
            : "Not yet registered"}
        </p>
        {tenant.deployment?.lastError ? (
          <Alert variant="destructive">
            <AlertDescription>{tenant.deployment.lastError}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
