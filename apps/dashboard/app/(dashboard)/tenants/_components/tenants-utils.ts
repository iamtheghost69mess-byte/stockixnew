import type { ProvisionEventRow } from "@/types/tenant";

export const POLL_MS = 2000;
export const MAX_WAIT_MS = 45 * 60 * 1000;

export type ProvisionPollRunning = {
  status: "queued" | "running";
  correlationId: string;
  events?: ProvisionEventRow[];
  message?: string;
};

export type PosDefaultCredentialsPayload = {
  adminPin: string;
  allRoles: { role: string; username: string; pin: string }[];
};

export type ProvisionPollComplete = {
  status: "complete";
  ready?: boolean;
  correlationId: string;
  oneTimeAdminPassword?: string | null;
  posDefaultCredentials?: PosDefaultCredentialsPayload | null;
  internalPort?: number;
  baseUrl?: string;
  events?: ProvisionEventRow[];
  note?: string;
  readiness?: {
    status: "NOT_READY" | "READY" | "DEGRADED";
    reasons: string[];
  };
};

export type ProvisionPollFailed = {
  status: "failed";
  correlationId: string;
  error: string;
  cause?: string;
  events?: ProvisionEventRow[];
};

export function mergeProvisionEvents(
  prev: ProvisionEventRow[],
  incoming: ProvisionEventRow[] | undefined,
): ProvisionEventRow[] {
  if (!incoming?.length) return prev;
  const m = new Map(prev.map((e) => [e.id, e]));
  for (const e of incoming) m.set(e.id, e);
  return [...m.values()].sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}

export async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

export const DELETE_POLL_MS = 3000;
export const DELETE_MAX_WAIT_MS = 5 * 60 * 1000;

/** After job status is complete, wait this long for readiness before finishing anyway. */
export const READINESS_GRACE_MS = 2 * 60 * 1000;

export const PROVISION_CORRELATION_SESSION_KEY = "stockix:provision-correlation-id";

export type ProvisionPhase = "submitting" | "provisioning" | "readiness";

/** Tick elapsed seconds every second until stopped (e.g. during DELETE fetch). */
export function startElapsedTimer(onTick: (elapsedSec: number) => void): () => void {
  const startedAt = Date.now();
  onTick(0);
  const id = setInterval(() => {
    onTick(Math.floor((Date.now() - startedAt) / 1000));
  }, 1000);
  return () => clearInterval(id);
}

const DELETE_PROGRESS_STEPS = [
  "Queuing removal job…",
  "Stopping Docker containers…",
  "Removing POS and PMS stacks…",
  "Cleaning MySQL, Mongo, and Redis…",
  "Removing Docker volumes and images…",
  "Deleting tenant records…",
] as const;

/** Poll until the tenant row is gone (worker finished deprovision). */
export async function pollUntilTenantRemoved(
  tenantId: string,
  onProgress: (message: string, elapsedSec: number) => void,
): Promise<void> {
  const started = Date.now();
  let stepIndex = 0;
  const deadline = started + DELETE_MAX_WAIT_MS;

  while (Date.now() < deadline) {
    const elapsedSec = Math.floor((Date.now() - started) / 1000);
    onProgress(
      DELETE_PROGRESS_STEPS[Math.min(stepIndex, DELETE_PROGRESS_STEPS.length - 1)]!,
      elapsedSec,
    );

    const res = await fetch(`/api/tenants/${tenantId}`);
    if (res.status === 404) {
      onProgress("Tenant removed completely.", elapsedSec);
      return;
    }

    stepIndex = Math.min(stepIndex + 1, DELETE_PROGRESS_STEPS.length - 1);
    await new Promise((r) => setTimeout(r, DELETE_POLL_MS));
  }

  throw new Error(
    `Removal is taking longer than expected (${DELETE_MAX_WAIT_MS / 60_000} min). ` +
      "The worker may still be cleaning up Docker — refresh the tenant list in a minute.",
  );
}
