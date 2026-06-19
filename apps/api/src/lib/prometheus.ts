import { Counter, Histogram, Registry, collectDefaultMetrics, Gauge } from "prom-client";

export const prometheusRegistry = new Registry();
collectDefaultMetrics({ register: prometheusRegistry });

export const deadLetterJobsGauge = new Gauge({
  name: "stockix_dead_letter_jobs_total",
  help: "Total number of jobs in the dead letter queue",
  registers: [prometheusRegistry],
});

export const failedLoginsTotal = new Counter({
  name: "stockix_failed_logins_total",
  help: "Total failed login attempts",
  registers: [prometheusRegistry],
});

export const activeProvisioningJobsGauge = new Gauge({
  name: "stockix_active_provisioning_jobs_total",
  help: "Total number of currently running tenant provisioning jobs",
  registers: [prometheusRegistry],
});

export const expiredLicensesGauge = new Gauge({
  name: "stockix_expired_licenses_total",
  help: "Total number of expired licenses in the platform",
  registers: [prometheusRegistry],
});

export const apiRequestTotal = new Counter({
  name: "stockix_api_request_total",
  help: "Total API HTTP requests",
  labelNames: ["method", "path", "status"] as const,
  registers: [prometheusRegistry],
});

export const apiRequestLatencyMs = new Histogram({
  name: "stockix_api_request_latency_ms",
  help: "API request latency in milliseconds",
  labelNames: ["method", "path", "status"] as const,
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
  registers: [prometheusRegistry],
});

export async function renderPrometheusMetrics(): Promise<string> {
  return prometheusRegistry.metrics();
}
