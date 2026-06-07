"use client";

import type { ProvisionEventRow } from "@/types/tenant";

import { Button } from "@/components/ui/button";

import type { ProvisionPhase } from "./tenants-utils";

type TenantProvisionBannerProps = {
  loading: boolean;
  elapsedSec: number;
  provisionPhase: ProvisionPhase;
  provisionLog: ProvisionEventRow[];
  streamCorrelationId: string | null;
  stoppingProvision: boolean;
  stopProvision: () => void | Promise<void>;
};

export function TenantProvisionBanner({
  loading,
  elapsedSec,
  provisionPhase,
  provisionLog,
  streamCorrelationId,
  stoppingProvision,
  stopProvision,
}: TenantProvisionBannerProps) {
  if (!loading) return null;

  const title =
    provisionPhase === "submitting"
      ? "Submitting provision request…"
      : provisionPhase === "readiness"
        ? "Waiting for tenant readiness…"
        : "Provisioning in progress";

  const subtitle =
    provisionPhase === "submitting"
      ? "First request in dev can take 1–2 minutes while Next.js compiles /api/tenants. The worker has not started yet."
      : provisionPhase === "readiness"
        ? "Docker work finished; health checks and routes are still converging."
        : "First run can take many minutes (image pulls, MySQL, migrations). Live steps below (SSE + persisted trace); status also polled for completion.";

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-sm text-amber-950 dark:text-amber-100">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-xs opacity-90">
        Elapsed {elapsedSec}s · {subtitle}
      </p>
      {loading ? (
        <div className="mt-3 max-h-56 overflow-y-auto rounded-md border border-amber-500/30 bg-background/80 px-2 py-2 font-mono text-[11px] leading-snug text-foreground">
          {provisionLog.length === 0 ? (
            <p className="text-muted-foreground">
              {streamCorrelationId
                ? "Waiting for trace events…"
                : "No worker trace yet — still queuing the provision job."}
            </p>
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
