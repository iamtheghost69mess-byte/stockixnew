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
    .then(() => console.log("Tracing terminated"))
    .catch((err) => console.log("Error terminating tracing", err))
    .finally(() => process.exit(0));
});

export function initTracing() {
  if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    try {
      sdk.start();
      console.log("OpenTelemetry Tracing initialized");
    } catch (err) {
      console.error("Failed to initialize OpenTelemetry Tracing", err);
    }
  }
}
