import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";

const exporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318/v1/traces",
});

const sdk = new NodeSDK({
  traceExporter: exporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      // We can customize or disable specific auto-instrumentations here if needed
      "@opentelemetry/instrumentation-fs": {
        enabled: false, // Disabling fs tracing to reduce trace pollution
      },
    }),
  ],
  serviceName: "control-plane-api",
});

// Gracefully shut down trace exporter on process exit
process.on("SIGTERM", () => {
  sdk
    .shutdown()
    .then(() => {
      const { logger } = require("./lib/logger.js") as typeof import("./lib/logger.js");
      logger.info("OpenTelemetry tracing terminated");
    })
    .catch(() => {})
    .finally(() => process.exit(0));
});

export function initTracing() {
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return;
  try {
    sdk.start();
  } catch {
    // Tracing is optional — boot must not fail if OTEL is unavailable
  }
}
