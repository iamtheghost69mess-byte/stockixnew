"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Copy, Loader2, RotateCw, TriangleAlert } from "lucide-react";
import { toast } from "@/components/reusabletoast";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatApiError } from "@/lib/api-errors";
import { cn } from "@/lib/utils";
import type { TenantDetail } from "@/types/tenant";

import { readJson } from "./tenant-detail-utils";

type BridgeSummaryPayload = {
  success?: boolean;
  data?: {
    healthy?: boolean;
    healthReason?: string | null;
    integrationEnabled?: boolean;
    financeTenantId?: number | null;
    mappingCoverage?: {
      bridgeReady?: boolean;
      sales?: { mappedMenuItemCount?: number; sellableMenuItemCount?: number; ready?: boolean };
      inventory?: {
        mappedIngredientCount?: number;
        ingredientCount?: number;
        ready?: boolean;
      };
    };
  };
  error?: string;
  message?: string;
};

export type TenantIntegrationStatusProps = {
  tenant: TenantDetail;
  posOrgHref: string;
  onTenantReload: () => Promise<void>;
};

export function TenantIntegrationStatus({
  tenant,
  posOrgHref,
  onTenantReload,
}: TenantIntegrationStatusProps) {
  const [repairingFinanceLink, setRepairingFinanceLink] = useState(false);
  const [bridgeLoading, setBridgeLoading] = useState(false);
  const [bridgeSummary, setBridgeSummary] = useState<BridgeSummaryPayload["data"] | null>(
    null,
  );
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const autoRepairAttempted = useRef(false);

  const tenantModules = tenant.modules ?? [];
  const hasAccountingAndPos =
    tenantModules.includes("accounting") && tenantModules.includes("pos");

  const copyProvisionId = async (label: string, value: number | null | undefined) => {
    if (value == null) return;
    try {
      await navigator.clipboard.writeText(String(value));
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Could not copy ${label}`);
    }
  };

  const loadBridgeSummary = useCallback(async () => {
    if (!hasAccountingAndPos) return;
    setBridgeLoading(true);
    setBridgeError(null);
    try {
      const res = await fetch(`/api/tenants/${tenant.id}/integration/bridge-summary`);
      const body = (await readJson(res)) as BridgeSummaryPayload;
      if (!res.ok) {
        setBridgeSummary(null);
        setBridgeError(formatApiError(body, "Could not load bridge summary."));
        return;
      }
      setBridgeSummary(body.data ?? null);
    } catch {
      setBridgeSummary(null);
      setBridgeError("Could not load bridge summary.");
    } finally {
      setBridgeLoading(false);
    }
  }, [hasAccountingAndPos, tenant.id]);

  const repairFinanceLink = async () => {
    setRepairingFinanceLink(true);
    try {
      const res = await fetch(`/api/tenants/${tenant.id}/repair-finance-link`, {
        method: "POST",
      });
      const body = await readJson(res);
      if (!res.ok) {
        toast.error(formatApiError(body, "Could not link Finance tenant."));
        return;
      }
      toast.success("Finance tenant linked.");
      await onTenantReload();
      await loadBridgeSummary();
    } finally {
      setRepairingFinanceLink(false);
    }
  };

  useEffect(() => {
    void loadBridgeSummary();
  }, [loadBridgeSummary]);

  useEffect(() => {
    if (autoRepairAttempted.current) return;
    if (!hasAccountingAndPos) return;
    const dep = tenant.deployment;
    if (!dep || dep.status !== "active") return;
    if (dep.financeTenantId != null && dep.financeTenantId > 0) return;
    autoRepairAttempted.current = true;
    void repairFinanceLink();
  }, [
    hasAccountingAndPos,
    tenant.deployment?.financeTenantId,
    tenant.deployment?.status,
    tenant.id,
  ]);

  if (!hasAccountingAndPos) {
    return null;
  }

  return (
    <Card className="md:col-span-3">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <CardTitle>Finance ↔ POS integration</CardTitle>
          <CardDescription>
            When both modules provision successfully, Bigcapital integration is enabled automatically
            in POS. Map menu items to Finance items in POS before paid orders sync. IDs below are
            for debugging.
          </CardDescription>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {(!tenant.deployment?.financeTenantId ||
            tenant.deployment.financeTenantId <= 0) &&
          (tenant.deployment?.status ?? "").toLowerCase() === "active" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={repairingFinanceLink}
              onClick={() => void repairFinanceLink()}
            >
              {repairingFinanceLink ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <RotateCw className="mr-1 h-4 w-4" />
              )}
              Repair Finance link
            </Button>
          ) : null}
          <Link
            href={posOrgHref}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")}
          >
            POS organizations
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="rounded-md border px-3 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium text-foreground">Bridge readiness</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={bridgeLoading}
              onClick={() => void loadBridgeSummary()}
            >
              {bridgeLoading ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <RotateCw className="mr-1 h-4 w-4" />
              )}
              Refresh
            </Button>
          </div>
          {bridgeError ? (
            <p className="mt-2 text-xs text-destructive">{bridgeError}</p>
          ) : bridgeSummary ? (
            <div className="mt-2 space-y-2 text-xs">
              <p className="flex items-center gap-1">
                {bridgeSummary.healthy ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <TriangleAlert className="h-3.5 w-3.5 text-amber-600" />
                )}
                Wire {bridgeSummary.healthy ? "healthy" : "unhealthy"}
                {bridgeSummary.healthReason ? ` — ${bridgeSummary.healthReason}` : ""}
              </p>
              <p>
                Sales: {bridgeSummary.mappingCoverage?.sales?.mappedMenuItemCount ?? 0}/
                {bridgeSummary.mappingCoverage?.sales?.sellableMenuItemCount ?? 0} menu items
                {bridgeSummary.mappingCoverage?.sales?.ready ? " (ready)" : " (incomplete)"}
              </p>
              <p>
                Inventory:{" "}
                {bridgeSummary.mappingCoverage?.inventory?.mappedIngredientCount ?? 0}/
                {bridgeSummary.mappingCoverage?.inventory?.ingredientCount ?? 0} ingredients
                {bridgeSummary.mappingCoverage?.inventory?.ready
                  ? " (ready)"
                  : " (incomplete)"}
              </p>
              <p className="font-medium">
                Bridge{" "}
                {bridgeSummary.mappingCoverage?.bridgeReady ? "ready for sync" : "not ready"}
              </p>
              <p className="text-muted-foreground">
                Operators map catalog in POS Studio → Accounting → Finance bridge.
              </p>
            </div>
          ) : bridgeLoading ? (
            <p className="mt-2 text-xs text-muted-foreground">Loading…</p>
          ) : null}
        </div>

        {[
          {
            label: "Finance tenant ID",
            value: tenant.deployment?.financeTenantId,
            configKey: "financeTenantId",
          },
          {
            label: "Walk-in customer ID",
            value: tenant.deployment?.financeWalkInCustomerId,
            configKey: "defaultWalkInCustomerId",
          },
          {
            label: "Cash deposit account ID",
            value: tenant.deployment?.financeCashAccountId,
            configKey: "defaultCashDepositAccountId",
          },
          {
            label: "Card deposit account ID",
            value: tenant.deployment?.financeCardAccountId,
            configKey: "defaultCardDepositAccountId",
          },
          {
            label: "Default warehouse ID",
            value: tenant.deployment?.financeDefaultWarehouseId,
            configKey: "defaultWarehouseId",
          },
        ].map((row) => (
          <div
            key={row.configKey}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
          >
            <div className="min-w-0">
              <p className="font-medium text-foreground">{row.label}</p>
              <p className="text-xs text-muted-foreground">
                POS field: <span className="font-mono">{row.configKey}</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs">
                {row.value != null ? row.value : "—"}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                disabled={row.value == null}
                aria-label={`Copy ${row.label}`}
                onClick={() => void copyProvisionId(row.label, row.value)}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
        {!tenant.deployment?.financeWalkInCustomerId &&
        !tenant.deployment?.financeCashAccountId ? (
          <p className="text-xs text-muted-foreground">
            IDs appear after provisioning completes with accounting and POS modules.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
