"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatApiError } from "@/lib/api-errors";
import type { AuditLogEntry } from "@/types/audit-log";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function parseEntries(body: unknown): AuditLogEntry[] {
  if (!isRecord(body) || !Array.isArray(body.entries)) return [];
  return body.entries.filter((row): row is AuditLogEntry => {
    if (!isRecord(row)) return false;
    return (
      typeof row.id === "string"
      && typeof row.action === "string"
      && typeof row.actionLabel === "string"
      && typeof row.actorId === "string"
      && typeof row.actorLabel === "string"
      && typeof row.createdAt === "string"
    );
  });
}

export type UseAuditLogOptions = {
  canView: boolean;
  page: number;
  pageSize: number;
  actionFilter: string;
  actorSearch: string;
  tenantSearch: string;
};

export type UseAuditLogResult = {
  entries: AuditLogEntry[];
  total: number;
  totalPages: number;
  loading: boolean;
  error: string | null;
};

export function useAuditLog({ canView, page, pageSize, actionFilter, actorSearch, tenantSearch }: UseAuditLogOptions): UseAuditLogResult {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    p.set("page", String(page));
    p.set("pageSize", String(pageSize));
    if (actionFilter) p.set("action", actionFilter);
    if (actorSearch.trim()) p.set("actor", actorSearch.trim());
    if (tenantSearch.trim()) p.set("tenant", tenantSearch.trim());
    return p.toString();
  }, [page, pageSize, actionFilter, actorSearch, tenantSearch]);

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/audit-log?${queryString}`);
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(formatApiError(data, res.status === 403 ? "Access denied" : `HTTP ${res.status}`));
        setEntries([]);
        setTotal(0);
        setTotalPages(1);
        return;
      }
      if (!isRecord(data)) {
        setEntries([]);
        return;
      }
      setEntries(parseEntries(data));
      setTotal(typeof data.total === "number" ? data.total : 0);
      setTotalPages(typeof data.totalPages === "number" ? data.totalPages : 1);
    } catch {
      setError("Failed to load audit log.");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [queryString, canView]);

  useEffect(() => {
    void load();
  }, [load]);

  return { entries, total, totalPages, loading, error };
}
