"use client";

import { useCallback, useEffect, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const apiBase =
  process.env.NEXT_PUBLIC_STOCKIX_API_URL ?? "http://localhost:4000";

const POLL_MS = 2000;
const MAX_WAIT_MS = 45 * 60 * 1000;

type Owner = { id: string; email: string; name: string };

type TenantRow = {
  tenantId: string;
  slug: string;
  name: string;
  adminEmail: string;
  deploymentStatus: string | null;
  internalPort: number | null;
  composeProject: string | null;
  lastError: string | null;
  registrationCompletedAt: string | null;
};

type ProvisionEventRow = {
  id: string;
  phase: string;
  level: string;
  message: string;
  meta: Record<string, unknown> | null;
  createdAt: string;
};

type ProvisionPollRunning = {
  status: "queued" | "running";
  correlationId: string;
  events?: ProvisionEventRow[];
  message?: string;
};

type ProvisionPollComplete = {
  status: "complete";
  correlationId: string;
  oneTimeAdminPassword?: string | null;
  internalPort?: number;
  baseUrl?: string;
  events?: ProvisionEventRow[];
  note?: string;
};

type ProvisionPollFailed = {
  status: "failed";
  correlationId: string;
  error: string;
  cause?: string;
  events?: ProvisionEventRow[];
};

function mergeProvisionEvents(
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

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

export default function TenantsPage() {
  const [owners, setOwners] = useState<Owner[]>([]);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oneTimePassword, setOneTimePassword] = useState<string | null>(null);
  const [provisionHint, setProvisionHint] = useState<string | null>(null);
  /** Shown after successful provision: local nginx URL + the admin email you typed (password is one-time only). */
  const [tenantAccess, setTenantAccess] = useState<{
    localUrl: string | null;
    publicUrl: string | null;
    adminEmail: string;
  } | null>(null);
  const [provisionLog, setProvisionLog] = useState<ProvisionEventRow[]>([]);
  const [streamCorrelationId, setStreamCorrelationId] = useState<string | null>(
    null,
  );
  const [elapsedSec, setElapsedSec] = useState(0);

  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminFirstName, setAdminFirstName] = useState("");
  const [adminLastName, setAdminLastName] = useState("");

  const load = useCallback(async () => {
    const [oRes, tRes] = await Promise.all([
      fetch(`${apiBase}/owners`),
      fetch(`${apiBase}/tenants`),
    ]);
    const o = (await readJson(oRes)) as { owners?: Owner[]; error?: string };
    const t = (await readJson(tRes)) as { tenants?: TenantRow[]; error?: string };
    if (!oRes.ok) {
      throw new Error(o.error ?? `owners: HTTP ${oRes.status}`);
    }
    if (!tRes.ok) {
      throw new Error(t.error ?? `tenants: HTTP ${tRes.status}`);
    }
    setOwners(o.owners ?? []);
    setTenants(t.tenants ?? []);
  }, []);

  useEffect(() => {
    load().catch((e) => setError(String(e)));
  }, [load]);

  useEffect(() => {
    if (!loading) {
      setElapsedSec(0);
      return;
    }
    const t0 = Date.now();
    const id = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - t0) / 1000));
    }, 500);
    return () => window.clearInterval(id);
  }, [loading]);

  useEffect(() => {
    if (!ownerId && owners.length > 0) {
      setOwnerId(owners[0]!.id);
    }
  }, [owners, ownerId]);

  useEffect(() => {
    if (!streamCorrelationId) return;
    const url = `${apiBase}/tenants/provision-stream/${streamCorrelationId}`;
    const es = new EventSource(url);
    const onProvision = (ev: MessageEvent) => {
      try {
        const row = JSON.parse(String(ev.data)) as ProvisionEventRow;
        if (row?.id) {
          setProvisionLog((prev) => mergeProvisionEvents(prev, [row]));
        }
      } catch {
        /* ignore malformed chunks */
      }
    };
    es.addEventListener("provision", onProvision);
    es.onerror = () => {
      es.close();
    };
    return () => {
      es.removeEventListener("provision", onProvision);
      es.close();
    };
  }, [streamCorrelationId]);

  const pollUntilDone = async (
    correlationId: string,
  ): Promise<ProvisionPollComplete> => {
    const deadline = Date.now() + MAX_WAIT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      const sr = await fetch(
        `${apiBase}/tenants/provision-status/${correlationId}`,
      );
      const sj = (await readJson(sr)) as
        | ProvisionPollRunning
        | ProvisionPollComplete
        | ProvisionPollFailed
        | { error?: string; message?: string };

      if (sr.status === 404) {
        const msg =
          (sj as { message?: string }).message ??
          "Provision status not found (API may have restarted). Check API logs and tenant list.";
        throw new Error(msg);
      }

      if (!sr.ok) {
        throw new Error(
          (sj as { error?: string }).error ?? `status HTTP ${sr.status}`,
        );
      }

      if ("events" in sj && Array.isArray((sj as { events?: unknown }).events)) {
        setProvisionLog((prev) =>
          mergeProvisionEvents(
            prev,
            (sj as { events: ProvisionEventRow[] }).events,
          ),
        );
      }

      if ("status" in sj && sj.status === "failed") {
        const f = sj as ProvisionPollFailed;
        throw new Error(
          [f.error, f.cause].filter(Boolean).join(" — "),
        );
      }

      if ("status" in sj && sj.status === "complete") {
        const ok = sj as ProvisionPollComplete;
        setOneTimePassword((prev) => ok.oneTimeAdminPassword ?? prev ?? null);
        setProvisionHint(
          ok.baseUrl && ok.internalPort != null
            ? `Stack: ${ok.baseUrl} · nginx on host port ${ok.internalPort} (open http://127.0.0.1:${ok.internalPort} locally).`
            : ok.note ?? null,
        );
        await load();
        return ok;
      }
    }
    throw new Error(
      `Still provisioning after ${MAX_WAIT_MS / 60000} minutes — check Docker and the API terminal, then refresh this page.`,
    );
  };

  const provision = async () => {
    const adminEmailForLogin = adminEmail.trim();
    setError(null);
    setOneTimePassword(null);
    setProvisionHint(null);
    setTenantAccess(null);
    setProvisionLog([]);
    setStreamCorrelationId(null);
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/tenants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          name,
          owner_id: ownerId,
          admin_email: adminEmail,
          admin_first_name: adminFirstName,
          admin_last_name: adminLastName,
        }),
      });

      const data = (await readJson(res)) as {
        error?: string;
        correlationId?: string;
        message?: string;
        accepted?: boolean;
        detail?: unknown;
      };

      if (res.status === 202 && data.accepted && data.correlationId) {
        setStreamCorrelationId(data.correlationId);
        const ok = await pollUntilDone(data.correlationId);
        const localUrl =
          ok.internalPort != null
            ? `http://127.0.0.1:${ok.internalPort}`
            : null;
        setTenantAccess({
          localUrl,
          publicUrl: ok.baseUrl ?? null,
          adminEmail: adminEmailForLogin,
        });
        setSlug("");
        setName("");
        setAdminEmail("");
        setAdminFirstName("");
        setAdminLastName("");
        return;
      }

      if (!res.ok) {
        const detail =
          data.detail && typeof data.detail === "object"
            ? JSON.stringify(data.detail)
            : "";
        setError(
          [data.error, detail, data.correlationId ? `id:${data.correlationId}` : ""]
            .filter(Boolean)
            .join(" — "),
        );
        return;
      }

      setError("Unexpected response (expected 202 Accepted).");
    } catch (e) {
      setError(String(e));
    } finally {
      setStreamCorrelationId(null);
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Tenants</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Provision a prod-shaped BigCapital stack per slug. Work runs in the
          background (Docker). A live trace streams over SSE (with Postgres
          audit rows); this page also polls status. Copy the one-time admin
          password when it appears — it is not stored after the job expires.
        </p>
      </div>

      {loading ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-sm text-amber-950 dark:text-amber-100">
          <p className="font-medium">Provisioning in progress</p>
          <p className="mt-1 text-xs opacity-90">
            Elapsed {elapsedSec}s · First run can take many minutes (image pulls,
            MySQL, migrations). Live steps below (SSE + persisted trace); status
            also polled for completion.
          </p>
          {streamCorrelationId ? (
            <div className="mt-3 max-h-56 overflow-y-auto rounded-md border border-amber-500/30 bg-background/80 px-2 py-2 font-mono text-[11px] leading-snug text-foreground">
              {provisionLog.length === 0 ? (
                <p className="text-muted-foreground">Waiting for trace events…</p>
              ) : (
                provisionLog.map((e) => (
                  <div
                    key={e.id}
                    className={`border-b border-border/40 py-1 last:border-b-0 ${
                      e.level === "error"
                        ? "text-destructive"
                        : e.level === "warn"
                          ? "text-amber-700 dark:text-amber-200"
                          : ""
                    }`}
                  >
                    <span className="text-muted-foreground">
                      {e.createdAt.slice(11, 19)}
                    </span>{" "}
                    <span className="font-medium text-foreground/90">
                      [{e.phase}]
                    </span>{" "}
                    {e.message}
                  </div>
                ))
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {oneTimePassword || tenantAccess ? (
        <div className="rounded-lg border border-border bg-muted/40 px-3 py-3 text-sm space-y-3">
          <div>
            <p className="font-medium text-foreground">BigCapital admin login</p>
            <p className="mt-1 text-xs text-muted-foreground">
              The admin email is the one you entered above. The password is{" "}
              <strong>not</strong> your Stockix password — Stockix generates a
              strong one-time password, registers that user in BigCapital, and
              shows it here only until the provision job expires (~15 minutes
              after completion).
            </p>
            {tenantAccess ? (
              <p className="mt-2 text-xs">
                <span className="text-muted-foreground">Email:</span>{" "}
                <span className="font-mono">{tenantAccess.adminEmail}</span>
              </p>
            ) : null}
          </div>
          {oneTimePassword ? (
            <div>
              <p className="font-medium text-foreground">One-time password</p>
              <p className="mt-1 break-all font-mono text-xs">{oneTimePassword}</p>
            </div>
          ) : (
            <p className="text-xs text-amber-800 dark:text-amber-200">
              Password not in this response (job may have expired). Use
              BigCapital&apos;s password reset or check API logs from the original
              provision run.
            </p>
          )}
          {tenantAccess?.localUrl ? (
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={tenantAccess.localUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ variant: "default" }))}
              >
                Open BigCapital (local)
              </a>
              <span className="text-xs text-muted-foreground">
                Opens{" "}
                <span className="font-mono">{tenantAccess.localUrl}</span> — sign
                in with the email and one-time password above, then complete
                BigCapital setup.
              </span>
            </div>
          ) : null}
          {tenantAccess?.publicUrl ? (
            <p className="text-xs text-muted-foreground">
              Public base URL in stack config:{" "}
              <span className="font-mono">{tenantAccess.publicUrl}</span> (needs
              DNS / hosts to match your slug for real TLS; local dev uses the
              button above).
            </p>
          ) : null}
          {provisionHint ? (
            <p className="text-xs text-muted-foreground">{provisionHint}</p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            BigCapital&apos;s HTTP login API uses the field name{" "}
            <span className="font-mono">crediential</span> (typo), not{" "}
            <span className="font-mono">credential</span>.
          </p>
        </div>
      ) : null}

      <div className="space-y-4 rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-medium">New tenant</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Stockix owner</span>
            <select
              className="flex h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
            >
              {owners.length === 0 ? (
                <option value="">No owners — insert one in Postgres</option>
              ) : null}
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.email})
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Slug (DNS label)</span>
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="acme-corp"
              autoComplete="off"
            />
          </label>
          <label className="space-y-1 text-xs sm:col-span-2">
            <span className="text-muted-foreground">Display name</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Corp"
            />
          </label>
          <label className="space-y-1 text-xs sm:col-span-2">
            <span className="text-muted-foreground">BigCapital admin email</span>
            <Input
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              placeholder="admin@acme.com"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Admin first name</span>
            <Input
              value={adminFirstName}
              onChange={(e) => setAdminFirstName(e.target.value)}
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Admin last name</span>
            <Input
              value={adminLastName}
              onChange={(e) => setAdminLastName(e.target.value)}
            />
          </label>
        </div>
        <Button
          type="button"
          disabled={loading || !ownerId || !slug || !name}
          onClick={() => void provision()}
        >
          {loading ? `Provisioning… ${elapsedSec}s` : "Provision tenant"}
        </Button>
      </div>

      <div>
        <h2 className="text-sm font-medium">Existing tenants</h2>
        <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
          {tenants.length === 0 ? (
            <li className="px-3 py-4 text-sm text-muted-foreground">
              No tenants yet.
            </li>
          ) : (
            tenants.map((t) => (
              <li key={t.tenantId} className="px-3 py-3 text-sm">
                <div className="font-medium">
                  {t.name}{" "}
                  <span className="font-normal text-muted-foreground">
                    ({t.slug})
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  admin {t.adminEmail} · status {t.deploymentStatus ?? "—"}
                  {t.internalPort != null ? ` · port ${t.internalPort}` : ""}
                  {t.lastError ? ` · error ${t.lastError.slice(0, 120)}` : ""}
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
