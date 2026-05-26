"use client";

import type { ProvisionEventRow } from "@/types/tenant";

import { Button } from "@/components/ui/button";

type TenantProvisionBannerProps = {
  loading: boolean;
  elapsedSec: number;
  provisionLog: ProvisionEventRow[];
  streamCorrelationId: string | null;
  stoppingProvision: boolean;
  stopProvision: () => void | Promise<void>;
};

export function TenantProvisionBanner({
  loading,
  elapsedSec,
  provisionLog,
  streamCorrelationId,
  stoppingProvision,
  stopProvision,
}: TenantProvisionBannerProps) {
  if (!loading) return null;

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-sm text-amber-950 dark:text-amber-100">
      <p className="font-medium">Provisioning in progress</p>
      <p className="mt-1 text-xs opacity-90">
        Elapsed {elapsedSec}s · First run can take many minutes (image pulls,
        MySQL, migrations). Live steps below (SSE + persisted trace); status
        also polled for completion.
      </p>
      {streamCorrelationId ? (
        <div className="mt-3 max-h-56 overflow-y-auto rounded-md border border-amber-500/30 bg-background/80 px-2 py-2 font-mono text-[11px] leading-snug text-foreground">
          {provisionLog.length === 0 ? (
            <p className="text-muted-foreground">Waiting for trace events…</p>
          ) : (
            provisionLog.map((e) => (
              <div
                key={e.id}
                className={`border-b border-border/40 py-1 last:border-b-0 ${
                  e.level === "error"
                    ? "text-destructive"
                    : e.level === "warn"
                      ? "text-amber-700 dark:text-amber-200"
                      : ""
                }`}
              >
                <span className="text-muted-foreground">
                  {e.createdAt.slice(11, 19)}
                </span>{" "}
                <span className="font-medium text-foreground/90">
                  [{e.phase}]
                </span>{" "}
                {e.message}
              </div>
            ))
          )}
        </div>
      ) : null}
      {streamCorrelationId ? (
        <div className="mt-3">
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => void stopProvision()}
            disabled={stoppingProvision}
          >
            {stoppingProvision ? "Stopping..." : "Stop provisioning"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
