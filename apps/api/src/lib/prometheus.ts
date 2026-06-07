import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";

export const prometheusRegistry = new Registry();
collectDefaultMetrics({ register: prometheusRegistry });

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
