"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  AlertCircle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  Trash2,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const apiBase =
  process.env.NEXT_PUBLIC_STOCKIX_API_URL ?? "http://localhost:4000";

const publicScheme =
  process.env.NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME ?? "http";
const publicRootDomain =
  process.env.NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN ?? "localhost";

function tenantAppOrigin(port: number) {
  return `http://127.0.0.1:${port}`;
}

function tenantLoginUrl(port: number) {
  return `${tenantAppOrigin(port)}/auth/login`;
}

/** Shown as “public” hint; routing/DNS must match your edge (Traefik) setup. */
function tenantPublicBaseUrl(slug: string) {
  return `${publicScheme}://${slug}.${publicRootDomain}`;
}

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

function metaSummary(meta: Record<string, unknown> | null): string | null {
  if (!meta || typeof meta !== "object") return null;
  try {
    return JSON.stringify(meta, null, 2);
  } catch {
    return String(meta);
  }
}

function ProvisionTracePanel({
  events,
  title,
  correlationId,
  copyKey,
  onCopy,
  copiedKey,
  streamNote,
  pollNote,
  compact,
}: {
  events: ProvisionEventRow[];
  title: string;
  correlationId: string | null;
  copyKey: string;
  onCopy: (key: string, text: string) => void;
  copiedKey: string | null;
  streamNote?: string | null;
  pollNote?: string | null;
  compact?: boolean;
}) {
  const fullText = JSON.stringify(
    { correlationId, events },
    null,
    2,
  );
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-foreground">{title}</p>
        <div className="flex flex-wrap items-center gap-2">
          {correlationId ? (
            <span className="rounded-md border border-border bg-muted/50 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
              correlationId: {correlationId}
            </span>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-[10px]"
            disabled={events.length === 0}
            onClick={() => onCopy(copyKey, fullText)}
          >
            <Copy className="mr-1 h-3 w-3" />
            {copiedKey === copyKey ? "Copied" : "Copy full trace (JSON)"}
          </Button>
        </div>
      </div>
      {streamNote ? (
        <p className="text-[11px] text-amber-800 dark:text-amber-200">{streamNote}</p>
      ) : null}
      {pollNote ? (
        <p className="text-[11px] text-muted-foreground">{pollNote}</p>
      ) : null}
      <div
        className={
          compact
            ? "max-h-56 overflow-y-auto rounded-md border border-border bg-muted/30 px-2 py-2 font-mono text-[11px] leading-snug"
            : "max-h-[min(70vh,36rem)] overflow-y-auto rounded-md border border-amber-500/30 bg-background/90 px-2 py-2 font-mono text-[11px] leading-snug text-foreground shadow-inner"
        }
      >
        {events.length === 0 ? (
          <p className="text-muted-foreground">
            No trace rows yet — waiting for API events (poll + SSE).
          </p>
        ) : (
          events.map((e) => {
            const metaStr = metaSummary(e.meta);
            return (
              <div
                key={e.id}
                className={`border-b border-border/40 py-2 last:border-b-0 ${
                  e.level === "error"
                    ? "text-destructive"
                    : e.level === "warn"
                      ? "text-amber-800 dark:text-amber-200"
                      : ""
                }`}
              >
                <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                  <span className="text-muted-foreground">
                    {e.createdAt.slice(11, 19)}
                  </span>
                  <span
                    className={`rounded px-1 font-semibold ${
                      e.level === "error"
                        ? "bg-destructive/15 text-destructive"
                        : e.level === "warn"
                          ? "bg-amber-500/15 text-amber-900 dark:text-amber-100"
                          : "bg-muted text-foreground"
                    }`}
                  >
                    {e.level}
                  </span>
                  <span className="font-medium text-foreground/90">
                    [{e.phase}]
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap wrap-break-word">{e.message}</p>
                {metaStr ? (
                  <details className="mt-1 text-[10px] text-muted-foreground">
                    <summary className="cursor-pointer select-none hover:text-foreground">
                      Details (meta)
                    </summary>
                    <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded border border-border/60 bg-muted/40 p-2 text-[10px]">
                      {metaStr}
                    </pre>
                  </details>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
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

function describeTenantProvisionError(data: {
  error?: string;
  message?: string;
  hint?: string;
  detail?: unknown;
  correlationId?: string;
}): string {
  const parts: string[] = [];
  if (data.message) {
    parts.push(data.message);
  } else if (data.error === "invalid_body" && data.detail && typeof data.detail === "object") {
    const d = data.detail as {
      fieldErrors?: Record<string, string[] | undefined>;
      formErrors?: string[];
    };
    const fe = d.fieldErrors;
    if (fe) {
      for (const [k, v] of Object.entries(fe)) {
        if (v?.length) parts.push(`${k}: ${v.join(" ")}`);
      }
    }
    if (d.formErrors?.length) parts.push(...d.formErrors);
  }
  if (data.hint) parts.push(data.hint);
  if (!parts.length && data.error) parts.push(data.error);
  return [
    parts.join(" — "),
    data.correlationId ? `id:${data.correlationId}` : "",
  ]
    .filter(Boolean)
    .join(" — ");
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
  /** Shown in UI for copy/debug until the next provision starts. */
  const [runCorrelationId, setRunCorrelationId] = useState<string | null>(null);
  const [sseStreamError, setSseStreamError] = useState<string | null>(null);
  const [pollHeartbeat, setPollHeartbeat] = useState<string | null>(null);
  const streamClosingRef = useRef(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminFirstName, setAdminFirstName] = useState("");
  const [adminLastName, setAdminLastName] = useState("");

  const copyText = useCallback(async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      setError("Could not copy to clipboard");
    }
  }, []);

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

  const removeTenant = useCallback(
    async (tenantId: string, slug: string) => {
      if (
        !globalThis.confirm(
          `Delete tenant "${slug}"?\n\nThis runs docker compose down, removes the tenant from Stockix, and deletes provision logs. This cannot be undone.`,
        )
      ) {
        return;
      }
      const wipeVolumes = globalThis.confirm(
        "Also remove Docker volumes?\n\nOK = delete MySQL / Mongo / Redis data for this stack.\nCancel = keep data volumes (containers are still removed).",
      );
      setDeletingId(tenantId);
      setError(null);
      try {
        const q = wipeVolumes ? "?volumes=true" : "";
        const res = await fetch(`${apiBase}/tenants/${tenantId}${q}`, {
          method: "DELETE",
        });
        const data = (await readJson(res)) as { error?: string };
        if (!res.ok) {
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        setTenantAccess(null);
        setOneTimePassword(null);
        setProvisionHint(null);
        await load();
      } catch (e) {
        setError(String(e));
      } finally {
        setDeletingId(null);
      }
    },
    [apiBase, load],
  );

  useEffect(() => {
    load().catch((e) => setError(String(e)));
  }, [load]);

  // Refetch when coming back from other routes or tabs (list + access links stay current).
  useEffect(() => {
    const refetch = () => {
      if (document.visibilityState === "visible") {
        load().catch((e) => setError(String(e)));
      }
    };
    document.addEventListener("visibilitychange", refetch);
    window.addEventListener("focus", refetch);
    return () => {
      document.removeEventListener("visibilitychange", refetch);
      window.removeEventListener("focus", refetch);
    };
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
    streamClosingRef.current = false;
    setSseStreamError(null);
    const url = `${apiBase}/tenants/provision-stream/${streamCorrelationId}`;
    const es = new EventSource(url);
    const onProvision = (ev: MessageEvent) => {
      try {
        const row = JSON.parse(String(ev.data)) as ProvisionEventRow;
        if (row?.id) {
          setProvisionLog((prev) => mergeProvisionEvents(prev, [row]));
        }
      } catch (parseErr) {
        const synthetic: ProvisionEventRow = {
          id: `client-parse-${Date.now()}`,
          phase: "client",
          level: "error",
          message: `SSE message could not be parsed as JSON: ${String(parseErr)}`,
          meta: { rawPreview: String(ev.data).slice(0, 800) },
          createdAt: new Date().toISOString(),
        };
        setProvisionLog((prev) => mergeProvisionEvents(prev, [synthetic]));
      }
    };
    es.addEventListener("provision", onProvision);
    es.onopen = () => {
      setSseStreamError(null);
    };
    es.onerror = () => {
      if (streamClosingRef.current) return;
      setSseStreamError(
        "Live SSE stream hit an error or timed out (the browser may reconnect). The API still records every step in Postgres — polling below merges the full trace.",
      );
    };
    return () => {
      streamClosingRef.current = true;
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
        throw new Error(`${msg} (correlationId=${correlationId})`);
      }

      if (!sr.ok) {
        const detail =
          sj && typeof sj === "object"
            ? JSON.stringify(sj).slice(0, 1200)
            : "";
        throw new Error(
          [(sj as { error?: string }).error ?? `status HTTP ${sr.status}`, detail]
            .filter(Boolean)
            .join(" — "),
        );
      }

      const evs = (sj as { events?: ProvisionEventRow[] }).events;
      const evLen = Array.isArray(evs) ? evs.length : 0;
      const jobStatus =
        "status" in sj ? String((sj as { status: string }).status) : "?";
      setPollHeartbeat(
        `GET provision-status · ${new Date().toLocaleTimeString()} · job=${jobStatus} · persisted_events=${evLen}`,
      );

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
          [
            f.error,
            f.cause ? `cause: ${f.cause}` : "",
            `correlationId=${correlationId}`,
            "See provision trace above/below for persisted steps.",
          ]
            .filter(Boolean)
            .join(" — "),
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
      `Still provisioning after ${MAX_WAIT_MS / 60000} minutes (correlationId=${correlationId}). Check Docker and the API terminal; trace rows may still be in Postgres — refresh and inspect tenant lastError.`,
    );
  };

  const provision = async () => {
    const adminEmailForLogin = adminEmail.trim();
    const adminFn = adminFirstName.trim();
    const adminLn = adminLastName.trim();
    if (
      !ownerId ||
      !slug.trim() ||
      !name.trim() ||
      !adminEmailForLogin ||
      !adminFn ||
      !adminLn
    ) {
      setError(
        "Fill every field: Stockix owner, slug, display name, tenant admin email, and admin first/last name.",
      );
      return;
    }
    setError(null);
    setOneTimePassword(null);
    setProvisionHint(null);
    setTenantAccess(null);
    setProvisionLog([]);
    setRunCorrelationId(null);
    setPollHeartbeat(null);
    setSseStreamError(null);
    setStreamCorrelationId(null);
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/tenants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: slug.trim(),
          name: name.trim(),
          owner_id: ownerId,
          admin_email: adminEmailForLogin,
          admin_first_name: adminFn,
          admin_last_name: adminLn,
        }),
      });

      const data = (await readJson(res)) as {
        error?: string;
        correlationId?: string;
        message?: string;
        hint?: string;
        accepted?: boolean;
        detail?: unknown;
        maxConcurrent?: number;
      };

      if (res.status === 429) {
        setError(
          [
            data.message ?? "Provisioning capacity reached.",
            data.maxConcurrent != null
              ? `(limit: ${data.maxConcurrent} concurrent run(s))`
              : "",
          ]
            .filter(Boolean)
            .join(" "),
        );
        return;
      }

      if (res.status === 202 && data.accepted && data.correlationId) {
        setRunCorrelationId(data.correlationId);
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
        setError(describeTenantProvisionError(data));
        return;
      }

      setError("Unexpected response (expected 202 Accepted).");
    } catch (e) {
      setError(String(e));
    } finally {
      setStreamCorrelationId(null);
      setPollHeartbeat(null);
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Tenants</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Create isolated tenant stacks (Docker). Progress streams live; when a
          tenant is <strong>active</strong>, use <strong>Open login</strong> in
          the list — it does not go away when you visit other pages. The
          one-time admin password is shown only once at the end of provisioning.
        </p>
      </div>

      {loading ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-sm text-amber-950 dark:text-amber-100">
          <p className="font-medium">Provisioning in progress</p>
          <p className="mt-1 text-xs opacity-90">
            Elapsed {elapsedSec}s · Every server step is written to{" "}
            <span className="font-mono">tenant_provision_events</span> and merged
            here via SSE + poll. Docker stderr is attached on compose failures.
          </p>
          {runCorrelationId ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="rounded border border-amber-600/30 bg-background/80 px-2 py-1 font-mono text-[10px] text-foreground">
                correlationId: {runCorrelationId}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-[10px]"
                onClick={() =>
                  copyText("cid", runCorrelationId)
                }
              >
                <Copy className="mr-1 h-3 w-3" />
                {copiedKey === "cid" ? "Copied" : "Copy id"}
              </Button>
            </div>
          ) : null}
          <div className="mt-4">
            <ProvisionTracePanel
              title="Live provision trace (same rows after finish)"
              correlationId={runCorrelationId}
              events={provisionLog}
              copyKey="live-trace"
              onCopy={copyText}
              copiedKey={copiedKey}
              streamNote={sseStreamError}
              pollNote={pollHeartbeat}
              compact={false}
            />
          </div>
        </div>
      ) : null}

      {!loading && provisionLog.length > 0 ? (
        <div className="rounded-lg border border-border bg-card px-3 py-3 text-sm">
          <ProvisionTracePanel
            title="Last provision trace (persisted on the API)"
            correlationId={runCorrelationId}
            events={provisionLog}
            copyKey="last-trace"
            onCopy={copyText}
            copiedKey={copiedKey}
            compact
          />
        </div>
      ) : null}

      {error ? (
        <pre className="whitespace-pre-wrap wrap-break-word rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 font-sans text-sm text-destructive">
          {error}
        </pre>
      ) : null}

      {oneTimePassword || tenantAccess ? (
        <div className="rounded-xl border border-border bg-muted/40 px-4 py-4 text-sm space-y-3">
          <div>
            <p className="font-medium text-foreground">Tenant admin access</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Use the admin email you entered below. The password is{" "}
              <strong>not</strong> your Stockix password — the platform issues a
              one-time password once and registers that admin in the tenant app.
              After you leave this page, use{" "}
              <strong>Open login</strong> in the tenant list — it stays there.
            </p>
            {tenantAccess ? (
              <p className="mt-2 text-xs">
                <span className="text-muted-foreground">Admin email:</span>{" "}
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
              Password not in this response (job may have expired). Use password
              reset in the tenant app or check API logs from the provision run.
            </p>
          )}
          {tenantAccess?.localUrl ? (
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={`${tenantAccess.localUrl}/auth/login`}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ variant: "default" }))}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Open login
              </a>
              <span className="text-xs text-muted-foreground">
                Same link stays under <span className="font-semibold">Existing tenants</span>{" "}
                below.
              </span>
            </div>
          ) : null}
          {tenantAccess?.publicUrl ? (
            <p className="text-xs text-muted-foreground">
              Public base URL in stack:{" "}
              <span className="font-mono">{tenantAccess.publicUrl}</span> — wire
              DNS / edge to your host port when moving beyond local dev.
            </p>
          ) : null}
          {provisionHint ? (
            <p className="text-xs text-muted-foreground">{provisionHint}</p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Tenant login API expects field{" "}
            <span className="font-mono">crediential</span> (upstream spelling).
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
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              placeholder="acme-corp"
              autoComplete="off"
            />
            <span className="block text-[11px] leading-snug text-muted-foreground">
              Lowercase only: letters, digits, and hyphens (e.g.{" "}
              <span className="font-mono">my-company</span>). No spaces or underscores — must match
              the API / tenant stack hostname segment.
            </span>
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
            <span className="text-muted-foreground">Tenant admin email</span>
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
          disabled={
            loading ||
            !ownerId ||
            !slug.trim() ||
            !name.trim() ||
            !adminEmail.trim() ||
            !adminFirstName.trim() ||
            !adminLastName.trim()
          }
          onClick={() => void provision()}
        >
          {loading ? `Provisioning… ${elapsedSec}s` : "Provision tenant"}
        </Button>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-sm font-medium">Existing tenants</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => load().catch((e) => setError(String(e)))}
          >
            Refresh list
          </Button>
        </div>
        <div className="grid gap-3">
          {tenants.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              No tenants yet. Provision one above — when it finishes, it appears
              here with an <strong>Open login</strong> action (local URL uses the
              allocated host port).
            </div>
          ) : (
            tenants.map((t) => {
              const status = t.deploymentStatus ?? "unknown";
              const statusChip =
                status === "active"
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100"
                  : status === "failed"
                    ? "border-destructive/40 bg-destructive/10 text-destructive"
                    : status === "provisioning" || status === "pending"
                      ? "border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100"
                      : "border-border bg-muted/50 text-muted-foreground";
              const port = t.internalPort;
              const canOpen = port != null && status === "active";
              const loginHref =
                port != null ? tenantLoginUrl(port) : null;
              const localOrigin =
                port != null ? tenantAppOrigin(port) : null;
              const publicHint = tenantPublicBaseUrl(t.slug);
              return (
                <div
                  key={t.tenantId}
                  className="rounded-xl border border-border bg-card p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-foreground">
                          {t.name}
                        </span>
                        <span className="rounded-md border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                          {t.slug}
                        </span>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize",
                            statusChip,
                          )}
                        >
                          {status === "active" ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : status === "failed" ? (
                            <AlertCircle className="h-3 w-3" />
                          ) : status === "provisioning" ||
                            status === "pending" ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <AlertCircle className="h-3 w-3 opacity-60" />
                          )}
                          {status.replace(/_/g, " ")}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Admin:{" "}
                        <span className="font-mono text-foreground/90">
                          {t.adminEmail}
                        </span>
                        {port != null ? (
                          <>
                            {" "}
                            · Host port{" "}
                            <span className="font-mono">{port}</span>
                          </>
                        ) : null}
                      </p>
                      {t.registrationCompletedAt ? (
                        <p className="text-[11px] text-muted-foreground">
                          Registered{" "}
                          {new Date(
                            t.registrationCompletedAt,
                          ).toLocaleString()}
                        </p>
                      ) : null}
                      {t.lastError ? (
                        <p className="text-xs text-destructive">
                          {t.lastError.slice(0, 280)}
                          {t.lastError.length > 280 ? "…" : ""}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                      {canOpen && loginHref ? (
                        <a
                          href={loginHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(
                            buttonVariants({ variant: "default", size: "sm" }),
                            "justify-center gap-1.5",
                          )}
                        >
                          <ExternalLink className="h-4 w-4" />
                          Open login
                        </a>
                      ) : (
                        <Button size="sm" variant="secondary" disabled>
                          Open login
                          {!port
                            ? " (no port)"
                            : status !== "active"
                              ? ` (${status})`
                              : ""}
                        </Button>
                      )}
                      {localOrigin ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-xs"
                          onClick={() =>
                            void copyText(
                              `origin-${t.tenantId}`,
                              localOrigin,
                            )
                          }
                          disabled={deletingId !== null}
                        >
                          <Copy className="h-3.5 w-3.5" />
                          {copiedKey === `origin-${t.tenantId}`
                            ? "Copied"
                            : "Copy base URL"}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="gap-1.5"
                        disabled={loading || deletingId !== null}
                        onClick={() => void removeTenant(t.tenantId, t.slug)}
                      >
                        {deletingId === t.tenantId ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Deleting…
                          </>
                        ) : (
                          <>
                            <Trash2 className="h-4 w-4" />
                            Delete tenant
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
                    <span>
                      Public URL hint:{" "}
                      <span className="font-mono text-foreground/80">
                        {publicHint}
                      </span>{" "}
                      (edge/DNS)
                    </span>
                    {t.composeProject ? (
                      <span className="font-mono">
                        compose: {t.composeProject}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
