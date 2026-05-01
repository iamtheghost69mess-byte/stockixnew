import type { ProvisionResult } from "./provisioner.js";

export type ProvisionJobState =
  | { status: "queued" }
  | { status: "running" }
  | { status: "succeeded"; result: Extract<ProvisionResult, { ok: true }> }
  | {
      status: "failed";
      message: string;
      cause?: string;
      correlationId: string;
    };

const jobs = new Map<string, ProvisionJobState>();

const TTL_MS = 15 * 60 * 1000;

function scheduleCleanup(correlationId: string): void {
  setTimeout(() => {
    jobs.delete(correlationId);
  }, TTL_MS);
}

export function setProvisionJob(
  correlationId: string,
  state: ProvisionJobState,
): void {
  jobs.set(correlationId, state);
  if (state.status === "succeeded" || state.status === "failed") {
    scheduleCleanup(correlationId);
  }
}

export function getProvisionJob(
  correlationId: string,
): ProvisionJobState | undefined {
  return jobs.get(correlationId);
}
