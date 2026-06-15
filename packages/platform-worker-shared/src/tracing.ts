// ORIGINAL:
// import { NodeSDK } from "@opentelemetry/sdk-node";
// import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
// import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
// import { Resource } from "@opentelemetry/resources";
// import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
// export function initTracing(serviceName: string) {
//   if (!process.env.ENABLE_TRACING) return;
//   const sdk = new NodeSDK({
//     resource: new Resource({
//       [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
//     }),
//     traceExporter: new OTLPTraceExporter({
//       url: process.env.OTLP_ENDPOINT || "http://localhost:4318/v1/traces",
//     }),
//     instrumentations: [getNodeAutoInstrumentations()],
//   });
//   sdk.start();
//   process.on("SIGTERM", () => {
//     sdk.shutdown().finally(() => process.exit(0));
//   });
// }

// @opentelemetry/instrumentation (and its require-in-the-middle /
// import-in-the-middle deps) do module-level Node require hooking that
// breaks esbuild's bundled ESM worker output ("Dynamic require of 'path'
// is not supported") if statically imported -- even when ENABLE_TRACING
// is unset, since static imports execute at module-load time regardless.
// Load OpenTelemetry lazily, only when tracing is actually enabled. These
// packages are listed in tsup.worker.config.ts's `external` so esbuild
// never tries to bundle them; Node resolves them normally at runtime.
export async function initTracing(serviceName: string) {
  if (!process.env.ENABLE_TRACING) return;

  const { NodeSDK } = await import("@opentelemetry/sdk-node");
  const { getNodeAutoInstrumentations } = await import(
    "@opentelemetry/auto-instrumentations-node"
  );
  const { OTLPTraceExporter } = await import(
    "@opentelemetry/exporter-trace-otlp-http"
  );
  const { Resource } = await import("@opentelemetry/resources");
  const { SemanticResourceAttributes } = await import(
    "@opentelemetry/semantic-conventions"
  );

  const sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    }),
    traceExporter: new OTLPTraceExporter({
      url: process.env.OTLP_ENDPOINT || "http://localhost:4318/v1/traces",
    }),
    instrumentations: [getNodeAutoInstrumentations()],
  });
  sdk.start();
  process.on("SIGTERM", () => {
    sdk.shutdown().finally(() => process.exit(0));
  });
}
