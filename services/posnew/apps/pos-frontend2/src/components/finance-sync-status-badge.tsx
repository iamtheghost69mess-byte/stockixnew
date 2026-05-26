"use client";

import { useState } from "react";

import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { posReplayFinanceSync } from "@/lib/pos-integration-api";

export type FinanceSyncStatus = "ok" | "failed" | "skipped" | null | undefined;

type FinanceSyncStatusBadgeProps = {
  readonly orderId: string;
  readonly status: FinanceSyncStatus;
  readonly error?: string | null;
  readonly onReplayed?: () => void;
  readonly compact?: boolean;
};

export function FinanceSyncStatusBadge({
  orderId,
  status,
  error,
  onReplayed,
  compact = false,
}: FinanceSyncStatusBadgeProps) {
  const [retrying, setRetrying] = useState(false);

  if (!status) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Finance sync pending
      </Badge>
    );
  }

  if (status === "ok") {
    return (
      <Badge variant="secondary" className="border-emerald-600/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200">
        {compact ? "Finance ✓" : "✓ Finance synced"}
      </Badge>
    );
  }

  if (status === "skipped") {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        {compact ? "Finance —" : "Finance sync skipped"}
      </Badge>
    );
  }

  async function handleRetry() {
    setRetrying(true);
    try {
      await posReplayFinanceSync(orderId);
      toast.success("Finance sync queued.");
      onReplayed?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Replay failed.");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="destructive">
        {compact ? "Finance ✗" : "✗ Finance sync failed"}
      </Badge>
      {!compact && error?.trim() ? (
        <span className="text-destructive max-w-[240px] truncate text-xs" title={error}>
          {error.trim()}
        </span>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 px-2 text-xs"
        disabled={retrying}
        onClick={() => void handleRetry()}
      >
        {retrying ? <Loader2 className="size-3 animate-spin" /> : null}
        Retry
      </Button>
    </div>
  );
}
