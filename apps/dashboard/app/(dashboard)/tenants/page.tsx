"use client";

import { useCallback, useEffect, useState } from "react";

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
  const [tenantAccess, setTenantAccess] = useState<{
    publicUrl: string | null;
    adminEmail: string;
  } | null>(null);
  const [provisionLog, setProvisionLog] = useState<ProvisionEventRow[]>([]);
  const [streamCorrelationId, setStreamCorrelationId] = useState<string | null>(
    null,
  );
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
        setTenantAccess({
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
          {tenantAccess?.publicUrl ? (
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={`${tenantAccess.publicUrl}/auth/login`}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ variant: "default" }))}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Open login
              </a>
              <span className="text-xs text-muted-foreground">
                Same link stays under{" "}
                <span className="font-semibold">Existing tenants</span> below.
              </span>
            </div>
          ) : null}
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
          disabled={loading || !ownerId || !slug || !name}
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
              const canOpen = status === "active";
              const publicOrigin = tenantPublicBaseUrl(t.slug);
              const loginHref = `${publicOrigin}/auth/login`;
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
                      {canOpen ? (
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
                          Open login{status !== "active" ? ` (${status})` : ""}
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={() =>
                          void copyText(`origin-${t.tenantId}`, publicOrigin)
                        }
                        disabled={deletingId !== null}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        {copiedKey === `origin-${t.tenantId}`
                          ? "Copied"
                          : "Copy URL"}
                      </Button>
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
                    <span className="font-mono text-foreground/80">
                      {publicOrigin}
                    </span>
                    {port != null ? (
                      <span>host port <span className="font-mono">{port}</span></span>
                    ) : null}
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
