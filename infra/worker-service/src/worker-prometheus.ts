import { Counter, Registry, collectDefaultMetrics } from "prom-client";

export const workerRegistry = new Registry();
collectDefaultMetrics({ register: workerRegistry });

export const workerJobSuccessTotal = new Counter({
  name: "stockix_worker_job_success_total",
  help: "Successful worker jobs",
  labelNames: ["jobType"] as const,
  registers: [workerRegistry],
});

export const workerJobFailureTotal = new Counter({
  name: "stockix_worker_job_failure_total",
  help: "Failed worker jobs",
  labelNames: ["jobType"] as const,
  registers: [workerRegistry],
});

export const workerJobPendingTotal = new Counter({
  name: "stockix_worker_job_pending_total",
  help: "Worker poll cycles (proxy for queue activity)",
  registers: [workerRegistry],
});

export async function renderWorkerPrometheusMetrics(): Promise<string> {
  return workerRegistry.metrics();
}
