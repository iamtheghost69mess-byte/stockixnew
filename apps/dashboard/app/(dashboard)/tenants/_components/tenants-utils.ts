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
