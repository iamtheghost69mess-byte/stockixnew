import { Counter, Gauge, Registry, collectDefaultMetrics } from "prom-client";

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

// ── Capacity metrics ─────────────────────────────────────────────────────────

export const tenantPortAllocated = new Gauge({
  name: "stockix_tenant_port_allocated_highest",
  help: "Highest allocated tenant port number",
  registers: [workerRegistry],
});

export const tenantPortCapacityPct = new Gauge({
  name: "stockix_tenant_port_capacity_pct",
  help: "Tenant port range utilization percentage (0–100)",
  registers: [workerRegistry],
});

export const diskUsagePct = new Gauge({
  name: "stockix_disk_usage_pct",
  help: "Disk usage percentage of TENANT_ENV_ROOT filesystem",
  registers: [workerRegistry],
});

export const proxysqlConnectionsPct = new Gauge({
  name: "stockix_proxysql_connections_pct",
  help: "ProxySQL active connections as percentage of max_connections",
  registers: [workerRegistry],
});

export async function renderWorkerPrometheusMetrics(): Promise<string> {
  return workerRegistry.metrics();
}
