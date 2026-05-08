"use client";

import { useCallback, useEffect, useState } from "react";

import { ExternalLink } from "lucide-react";

import TenantCreateWizard from "@/components/tenant-create-wizard";
import TenantList from "@/components/tenant-list";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { tenantPublicBaseUrl } from "@/lib/tenant-url";
import type { ProvisionEventRow, TenantRow } from "@/types/tenant";
import { useMe } from "@/hooks/use-me";

const POLL_MS = 2000;
const MAX_WAIT_MS = 45 * 60 * 1000;

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
  const me = useMe();
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
  const [stoppingProvision, setStoppingProvision] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [suspendingId, setSuspendingId] = useState<string | null>(null);
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);

  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminFirstName, setAdminFirstName] = useState("");
  const [adminLastName, setAdminLastName] = useState("");

  const load = useCallback(async () => {
    const tRes = await fetch("/api/tenants");
    const t = (await readJson(tRes)) as { tenants?: TenantRow[]; error?: string };
    if (!tRes.ok) {
      throw new Error(t.error ?? `tenants: HTTP ${tRes.status}`);
    }
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
        const res = await fetch(`/api/tenants/${tenantId}${q}`, {
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
    [load],
  );

  const handleSuspend = useCallback(
    async (tenantId: string, slug: string) => {
      setSuspendingId(tenantId);
      setError(null);
      try {
        const res = await fetch(`/api/tenants/${tenantId}/suspend`, {
          method: "POST",
        });
        const data = (await readJson(res)) as { error?: string };
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setTenants((prev) =>
          prev.map((t) =>
            t.tenantId === tenantId
              ? { ...t, deploymentStatus: "suspended", lastError: null }
              : t,
          ),
        );
      } catch (e) {
        setError(`Failed to suspend ${slug}: ${String(e)}`);
      } finally {
        setSuspendingId(null);
      }
    },
    [],
  );

  const handleReactivate = useCallback(
    async (tenantId: string, slug: string) => {
      setReactivatingId(tenantId);
      setError(null);
      try {
        const res = await fetch(`/api/tenants/${tenantId}/reactivate`, {
          method: "POST",
        });
        const data = (await readJson(res)) as { error?: string };
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setTenants((prev) =>
          prev.map((t) =>
            t.tenantId === tenantId
              ? { ...t, deploymentStatus: "active", lastError: null }
              : t,
          ),
        );
      } catch (e) {
        setError(`Failed to reactivate ${slug}: ${String(e)}`);
      } finally {
        setReactivatingId(null);
      }
    },
    [],
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
    if (!streamCorrelationId) return;
    const url = `/api/tenants/provision-stream/${streamCorrelationId}`;
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
        `/api/tenants/provision-status/${correlationId}`,
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

  const stopProvision = useCallback(async () => {
    if (!streamCorrelationId) return;
    setStoppingProvision(true);
    try {
      const res = await fetch(`/api/tenants/provision-stop/${streamCorrelationId}`, {
        method: "POST",
      });
      const data = (await readJson(res)) as { error?: string; status?: string };
      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setProvisionLog((prev) =>
        mergeProvisionEvents(prev, [
          {
            id: `local-stop-${Date.now()}`,
            phase: "cancel",
            level: "warn",
            message:
              data.status === "cancellation_requested"
                ? "Stop requested. Worker is stopping and rolling back."
                : "Provisioning stopped.",
            meta: null,
            createdAt: new Date().toISOString(),
          },
        ]),
      );
      setError(
        data.status === "cancellation_requested"
          ? "Stop requested. Provisioning is aborting in background."
          : "Provisioning stopped.",
      );
      setLoading(false);
      setStreamCorrelationId(null);
      await load();
    } catch (e) {
      setError(`Failed to stop provisioning: ${String(e)}`);
    } finally {
      setStoppingProvision(false);
    }
  }, [load, streamCorrelationId]);

  const provision = async (payload?: {
    slug: string;
    name: string;
    ownerId: string;
    adminEmail: string;
    adminFirstName: string;
    adminLastName: string;
  }) => {
    const nextSlug = payload?.slug ?? slug;
    const nextName = payload?.name ?? name;
    const nextOwnerId = payload?.ownerId ?? "";
    const nextAdminEmail = payload?.adminEmail ?? adminEmail;
    const nextAdminFirstName = payload?.adminFirstName ?? adminFirstName;
    const nextAdminLastName = payload?.adminLastName ?? adminLastName;
    const adminEmailForLogin = nextAdminEmail.trim();
    setError(null);
    setOneTimePassword(null);
    setTenantAccess(null);
    setProvisionLog([]);
    setStreamCorrelationId(null);
    setLoading(true);
    try {
      const res = await fetch("/api/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: nextSlug,
          name: nextName,
          owner_id: nextOwnerId,
          admin_email: nextAdminEmail,
          admin_first_name: nextAdminFirstName,
          admin_last_name: nextAdminLastName,
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
          publicUrl:
            tenantPublicBaseUrl(nextSlug, ok.internalPort ?? null) ??
            ok.baseUrl ??
            null,
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
        const normalizedError =
          data.error === "mfa_required"
            ? "MFA is required for Super Admin privileged actions. Enable MFA in your owner account, then retry provisioning."
            : data.error;
        const detail =
          data.detail && typeof data.detail === "object"
            ? JSON.stringify(data.detail)
            : "";
        setError(
          [normalizedError, detail, data.correlationId ? `id:${data.correlationId}` : ""]
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
          {streamCorrelationId ? (
            <div className="mt-3">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => void stopProvision()}
                disabled={stoppingProvision}
              >
                {stoppingProvision ? "Stopping..." : "Stop provisioning"}
              </Button>
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

      <TenantCreateWizard
        loading={loading}
        provisionLog={provisionLog}
        elapsedSec={elapsedSec}
        oneTimePassword={oneTimePassword}
        tenantAccess={tenantAccess}
        onProvision={async (data) => {
          if (!me?.id) {
            setError("Unable to resolve current user. Please refresh and try again.");
            return;
          }
          setSlug(data.slug);
          setName(data.name);
          setAdminEmail(data.adminEmail);
          setAdminFirstName(data.adminFirstName);
          setAdminLastName(data.adminLastName);
          await provision({ ...data, ownerId: me.id });
        }}
        onReset={() => {
          setOneTimePassword(null);
          setTenantAccess(null);
          setProvisionLog([]);
        }}
      />

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
        <TenantList
          tenants={tenants}
          onDelete={removeTenant}
          onSuspend={handleSuspend}
          onReactivate={handleReactivate}
          deletingId={deletingId}
          suspendingId={suspendingId}
          reactivatingId={reactivatingId}
        />
      </div>
    </div>
  );
}
