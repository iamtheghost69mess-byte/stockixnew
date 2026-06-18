"use client";

import { useCallback, useEffect, useState } from "react";

import { formatApiError } from "@/lib/api-errors";
import type { LicenseAnalytics } from "@/types/license";
import type { TenantRow } from "@/types/tenant";

export interface TenantStats {
  total: number;
  active: number;
  suspended: number;
  provisioning: number;
  failed: number;
}

export interface LicenseStats {
  total: number;
  active: number;
  unassigned: number;
  expired: number;
  revoked: number;
  expiringIn30Days: number;
}

export interface DashboardStats {
  tenants: TenantStats;
  licenses: LicenseStats;
  isLoading: boolean;
  error: string | null;
  refetch: (options?: { silent?: boolean }) => void;
}

const REFRESH_MS = 30_000;

function emptyTenantStats(): TenantStats {
  return { total: 0, active: 0, suspended: 0, provisioning: 0, failed: 0 };
}

function emptyLicenseStats(): LicenseStats {
  return { total: 0, active: 0, unassigned: 0, expired: 0, revoked: 0, expiringIn30Days: 0 };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function parseDirectoryTotals(body: unknown): TenantStats | null {
  if (!isRecord(body) || !isRecord(body.directoryTotals)) return null;
  const d = body.directoryTotals;
  const n = (k: string): number => {
    const v = d[k];
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
  };
  return {
    total: n("total"),
    active: n("active"),
    suspended: n("suspended"),
    provisioning: n("provisioning"),
    failed: n("failed"),
  };
}

function parseTenantRows(body: unknown): TenantRow[] {
  if (!isRecord(body) || !Array.isArray(body.tenants)) return [];
  return body.tenants.filter((row): row is TenantRow => {
    if (!isRecord(row)) return false;
    return (
      typeof row.tenantId === "string" &&
      typeof row.slug === "string" &&
      typeof row.name === "string" &&
      typeof row.adminEmail === "string"
    );
  });
}

function aggregateTenants(rows: TenantRow[]): TenantStats {
  const out = emptyTenantStats();
  out.total = rows.length;
  for (const t of rows) {
    const d = (t.deploymentStatus ?? "unknown").toLowerCase();
    if (d === "active") out.active += 1;
    else if (d === "suspended") out.suspended += 1;
    else if (d === "provisioning" || d === "pending") out.provisioning += 1;
    else if (d === "failed") out.failed += 1;
  }
  return out;
}

function parseLicenseAnalytics(body: unknown): LicenseAnalytics | null {
  if (!isRecord(body)) return null;
  const n = (k: string): number => {
    const v = body[k];
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
  };
  if (typeof body.total !== "number") return null;
  const byProduct = isRecord(body.byProduct) ? body.byProduct : {};
  const byPlan = isRecord(body.byPlan) ? body.byPlan : {};
  return {
    total: n("total"),
    active: n("active"),
    unassigned: n("unassigned"),
    revoked: n("revoked"),
    expired: n("expired"),
    expiringIn30Days: n("expiringIn30Days"),
    byProduct: {
      platform: typeof byProduct.platform === "number" ? byProduct.platform : 0,
      pos_desktop: typeof byProduct.pos_desktop === "number" ? byProduct.pos_desktop : 0,
      bundle: typeof byProduct.bundle === "number" ? byProduct.bundle : 0,
    },
    byPlan: Object.fromEntries(
      Object.entries(byPlan).filter(([, v]) => typeof v === "number") as [string, number][],
    ),
  };
}

export function useDashboardStats(): DashboardStats {
  const [tenants, setTenants] = useState<TenantStats>(emptyTenantStats);
  const [licenses, setLicenses] = useState<LicenseStats>(emptyLicenseStats);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async (options?: { silent?: boolean }) => {
    const silent = Boolean(options?.silent);
    if (!silent) {
      setIsLoading(true);
    }
    setError(null);
    try {
      const [tRes, aRes] = await Promise.all([
        fetch("/api/tenants?page=1&pageSize=1"),
        fetch("/api/licenses/analytics"),
      ]);

      const tBody: unknown = await tRes.json().catch(() => ({}));
      if (!tRes.ok) {
        throw new Error(
          formatApiError(
            tBody,
            isRecord(tBody) && typeof tBody.error === "string"
              ? tBody.error
              : `Tenants HTTP ${tRes.status}`,
          ),
        );
      }
      const fromTotals = parseDirectoryTotals(tBody);
      if (fromTotals) {
        setTenants(fromTotals);
      } else {
        setTenants(aggregateTenants(parseTenantRows(tBody)));
      }

      const aBody: unknown = await aRes.json().catch(() => ({}));
      if (!aRes.ok) {
        throw new Error(
          formatApiError(
            aBody,
            isRecord(aBody) && typeof aBody.error === "string"
              ? aBody.error
              : `License analytics HTTP ${aRes.status}`,
          ),
        );
      }
      const analytics = parseLicenseAnalytics(aBody);
      if (!analytics) {
        throw new Error("Invalid license analytics response.");
      }

      setLicenses({
        total: analytics.total,
        active: analytics.active,
        unassigned: analytics.unassigned,
        expired: analytics.expired,
        revoked: analytics.revoked,
        expiringIn30Days: analytics.expiringIn30Days,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setTenants(emptyTenantStats());
      setLicenses(emptyLicenseStats());
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void refetch({ silent: false });
  }, [refetch]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void refetch({ silent: true });
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [refetch]);

  return { tenants, licenses, isLoading, error, refetch };
}
