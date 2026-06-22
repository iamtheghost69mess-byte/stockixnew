"use client";

import { useCallback, useEffect, useState } from "react";
import { formatApiError } from "@/lib/api-errors";

export type EmailLogRow = {
  id: string;
  templateKey: string;
  status: string;
  deliveryStatus: string | null;
  providerMessageId: string | null;
  error: string | null;
  tenantId: string | null;
  tenantSlug: string | null;
  tenantName: string | null;
  createdAt: string;
};

export type UseEmailLogsOptions = {
  canView: boolean;
  templateKey: string;
  status: string;
  page: number;
};

export type UseEmailLogsResult = {
  logs: EmailLogRow[];
  totalPages: number;
  loading: boolean;
  error: string | null;
};

export function useEmailLogs({ canView, templateKey, status, page }: UseEmailLogsOptions): UseEmailLogsResult {
  const [logs, setLogs] = useState<EmailLogRow[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (templateKey.trim()) params.set("templateKey", templateKey.trim());
    if (status.trim()) params.set("status", status.trim());
    try {
      const res = await fetch(`/api/admin/email-logs?${params}`);
      const data = (await res.json()) as {
        logs?: EmailLogRow[];
        totalPages?: number;
        error?: string;
      };
      if (!res.ok) {
        setError(formatApiError(data, res.statusText));
        setLogs([]);
        return;
      }
      setLogs(data.logs ?? []);
      setTotalPages(Math.max(1, data.totalPages ?? 1));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load email logs");
    } finally {
      setLoading(false);
    }
  }, [canView, page, templateKey, status]);

  useEffect(() => {
    void load();
  }, [load]);

  return { logs, totalPages, loading, error };
}
