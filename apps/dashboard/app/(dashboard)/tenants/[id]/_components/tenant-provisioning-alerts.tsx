"use client";

import { useState } from "react";
import { AlertCircle, Loader2, RotateCw, Square } from "lucide-react";
import { toast } from "@/components/reusabletoast";

import { Alert, AlertDescription, AlertTitle } from "@repo/ui/alert";
import { Button } from "@repo/ui/button";
import { formatApiError } from "@/lib/api-errors";
import type { TenantDetail } from "@/types/tenant";

import { MAX_PROVISION_POLL_MS, readJson } from "./tenant-detail-utils";

export type TenantProvisioningAlertsProps = {
  tenant: TenantDetail;
  isProvisioning: boolean;
  provisionPollTimedOut: boolean;
  provisionPartial: boolean;
  onProvisionPollTimedOutChange: (value: boolean) => void;
  onProvisionPollStartedAtReset: () => void;
  onReload: () => Promise<void>;
  onReloadEvents: () => Promise<void>;
  onStopProvisionOpen: () => void;
  onError: (message: string) => void;
};

async function queueProvisionRetry(
  tenantId: string,
  body: Record<string, unknown>,
  successMessage: string,
  onError: (message: string) => void,
  onReload: () => Promise<void>,
  onReloadEvents: () => Promise<void>,
): Promise<boolean> {
  const res = await fetch(`/api/tenants/${tenantId}/retry-provision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await readJson(res)) as { error?: string; message?: string };
  if (!res.ok) {
    onError(formatApiError(data, data.message ?? data.error ?? `HTTP ${res.status}`));
    return false;
  }
  toast.success(successMessage);
  await onReload();
  await onReloadEvents();
  return true;
}

export function TenantProvisioningAlerts({
  tenant,
  isProvisioning,
  provisionPollTimedOut,
  provisionPartial,
  onProvisionPollTimedOutChange,
  onProvisionPollStartedAtReset,
  onReload,
  onReloadEvents,
  onStopProvisionOpen,
  onError,
}: TenantProvisioningAlertsProps) {
  const [retryingProvision, setRetryingProvision] = useState(false);
  const partialKind = tenant.deployment?.partialFailureKind ?? null;
  const wireFailed = partialKind === "wire_failed";
  const posFailed = partialKind === "pos_failed" || partialKind === null;

  return (
    <>
      {provisionPollTimedOut && isProvisioning ? (
        <Alert className="border-amber-500/50 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-50">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Provisioning is taking longer than expected</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              Auto-refresh paused after {MAX_PROVISION_POLL_MS / 60000} minutes. Check provisioning
              events below, worker logs, and Docker — then refresh manually or stop provisioning.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  onProvisionPollTimedOutChange(false);
                  onProvisionPollStartedAtReset();
                  void onReload();
                  void onReloadEvents();
                }}
              >
                <RotateCw className="mr-1 h-4 w-4" />
                Resume auto-refresh
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  void onReload();
                  void onReloadEvents();
                }}
              >
                Refresh now
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onStopProvisionOpen}
              >
                <Square className="mr-1 h-4 w-4" />
                Stop provisioning
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {provisionPartial ? (
        <Alert className="border-amber-500/50 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-50">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Partial provisioning</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              {wireFailed
                ? "Finance and POS stacks are up, but Stockix → POS → Finance integration wiring did not complete."
                : posFailed
                  ? tenant.deployment?.lastError
                    ? tenant.deployment.lastError
                    : "Finance completed, but POS provisioning did not finish successfully."
                  : tenant.deployment?.lastError
                    ? tenant.deployment.lastError
                    : "Finance completed, but POS provisioning or integration wiring did not finish."}
            </p>
            <ul className="list-inside list-disc text-sm opacity-90">
              <li>
                Finance tenant id:{" "}
                <span className="font-mono">
                  {tenant.deployment?.financeTenantId ?? "missing"}
                </span>
              </li>
              <li>
                POS organization:{" "}
                <span className="font-mono">
                  {tenant.posOrganizationId ?? tenant.deployment?.posUrl ?? "missing"}
                </span>
              </li>
              {partialKind ? (
                <li>
                  Failure kind: <span className="font-mono">{partialKind}</span>
                </li>
              ) : null}
            </ul>
            <div className="flex flex-wrap gap-2">
              {posFailed ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-amber-600/40"
                  disabled={retryingProvision}
                  onClick={async () => {
                    setRetryingProvision(true);
                    onError("");
                    try {
                      await queueProvisionRetry(
                        tenant.id,
                        { retryPosOnly: true },
                        "POS provisioning retry queued",
                        onError,
                        onReload,
                        onReloadEvents,
                      );
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
                  Retry POS only
                </Button>
              ) : null}
              {wireFailed ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-amber-600/40"
                  disabled={retryingProvision}
                  onClick={async () => {
                    setRetryingProvision(true);
                    onError("");
                    try {
                      await queueProvisionRetry(
                        tenant.id,
                        { retryWireOnly: true },
                        "Integration wiring retry queued",
                        onError,
                        onReload,
                        onReloadEvents,
                      );
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
                  Retry integration wiring
                </Button>
              ) : null}
            </div>
          </AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}
