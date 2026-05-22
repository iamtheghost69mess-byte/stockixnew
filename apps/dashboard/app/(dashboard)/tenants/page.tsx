"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { ChevronLeft, ChevronRight, Download, ExternalLink, Loader2 } from "lucide-react";

import TenantCreateWizard from "@/components/tenant-create-wizard";
import { TenantList, type TenantSortOrder } from "@/components/tenant-list";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { tenantPublicBaseUrl } from "@/lib/tenant-url";
import type { ProvisionEventRow, TenantDirectoryTotals, TenantRow } from "@/types/tenant";
import { useMe } from "@/hooks/use-me";
import { formatApiError } from "@/lib/api-errors";

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
  ready?: boolean;
  correlationId: string;
  oneTimeAdminPassword?: string | null;
  internalPort?: number;
  baseUrl?: string;
  events?: ProvisionEventRow[];
  note?: string;
  readiness?: {
    status: "NOT_READY" | "READY" | "DEGRADED";
    reasons: string[];
  };
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

function TenantsPageContent() {
  const me = useMe();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialListStatus = useMemo((): "all" | "active" | "suspended" | "provisioning" | "failed" => {
    const s = searchParams.get("status");
    if (s === "active" || s === "suspended" || s === "provisioning" || s === "failed") return s;
    return "all";
  }, [searchParams]);
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
  const [deleteProgressMessage, setDeleteProgressMessage] = useState<string | null>(null);
  const [suspendingId, setSuspendingId] = useState<string | null>(null);
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const [addTenantOpen, setAddTenantOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ tenantId: string; slug: string } | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteVolumesOpen, setDeleteVolumesOpen] = useState(false);
  const [deleteSlugInput, setDeleteSlugInput] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "suspended" | "provisioning" | "failed"
  >(initialListStatus);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [listTotal, setListTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [directoryTotals, setDirectoryTotals] = useState<TenantDirectoryTotals | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<TenantSortOrder>("newest");

  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminFirstName, setAdminFirstName] = useState("");
  const [adminLastName, setAdminLastName] = useState("");

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    p.set("page", String(page));
    p.set("pageSize", String(pageSize));
    if (search.trim()) p.set("search", search.trim());
    if (statusFilter !== "all") p.set("status", statusFilter);
    p.set("sort", sortOrder);
    return p.toString();
  }, [page, pageSize, search, statusFilter, sortOrder]);

  const load = useCallback(async () => {
    setListLoading(true);
    try {
      const tRes = await fetch(`/api/tenants?${queryString}`);
      const t = (await readJson(tRes)) as {
        tenants?: TenantRow[];
        total?: number;
        totalPages?: number;
        directoryTotals?: TenantDirectoryTotals;
        error?: string;
      };
      if (!tRes.ok) {
        throw new Error(formatApiError(t, t.error ?? `tenants: HTTP ${tRes.status}`));
      }
      setTenants(t.tenants ?? []);
      setListTotal(t.total ?? 0);
      setTotalPages(t.totalPages ?? 1);
      if (t.directoryTotals) setDirectoryTotals(t.directoryTotals);
    } finally {
      setListLoading(false);
    }
  }, [queryString]);

  const statusParam = searchParams.get("status");
  useEffect(() => {
    const next =
      statusParam === "active" ||
      statusParam === "suspended" ||
      statusParam === "provisioning" ||
      statusParam === "failed"
        ? statusParam
        : "all";
    setStatusFilter(next);
  }, [statusParam]);

  useEffect(() => {
    const id = window.setTimeout(() => setSearch(searchInput), 300);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, sortOrder]);

  const requestTenantDelete = useCallback((tenantId: string, slug: string) => {
    setDeleteTarget({ tenantId, slug });
    setDeleteSlugInput("");
    setDeleteConfirmOpen(true);
  }, []);

  const executeTenantDelete = useCallback(
    async (tenantId: string, slug: string, wipeVolumes: boolean) => {
      setDeletingId(tenantId);
      setDeleteProgressMessage(
        wipeVolumes
          ? "Deleting tenant and Docker volumes…"
          : "Deleting tenant (keeping volumes)…",
      );
      setError(null);
      try {
        const q = wipeVolumes ? "?volumes=true" : "";
        const deleteOnce = async () => {
          const res = await fetch(`/api/tenants/${tenantId}${q}`, {
            method: "DELETE",
          });
          const data = (await readJson(res)) as {
            error?: string;
            message?: string;
            tenantStatus?: string | null;
            deploymentStatus?: string | null;
          };
          return { res, data };
        };

        setDeleteProgressMessage("Removing deployment…");
        let { res, data } = await deleteOnce();
        if (!res.ok && res.status === 409 && data.error === "tenant_busy") {
          const provisioningBusy =
            data.tenantStatus === "provisioning" ||
            data.deploymentStatus === "provisioning";
          setDeleteProgressMessage(
            provisioningBusy
              ? "Stopping provisioning…"
              : "Suspending tenant before delete…",
          );
          const transitionPath = provisioningBusy
            ? `/api/tenants/${tenantId}/provision-stop`
            : `/api/tenants/${tenantId}/suspend`;
          const transitionRes = await fetch(transitionPath, { method: "POST" });
          const transitionData = (await readJson(transitionRes)) as {
            error?: string;
            message?: string;
          };
          const alreadyTransitioned =
            !transitionRes.ok
            && (transitionData.error === "tenant_not_active"
              || transitionData.error === "tenant_not_provisioning");
          if (!transitionRes.ok && !alreadyTransitioned) {
            throw new Error(
              formatApiError(
                transitionData,
                transitionData.message ??
                  transitionData.error ??
                  "Tenant is busy and automatic stop/suspend failed.",
              ),
            );
          }

          for (let i = 0; i < 15; i += 1) {
            setDeleteProgressMessage(
              `Waiting for tenant to stop… (${i + 1}/15)`,
            );
            await new Promise((r) => setTimeout(r, 2000));
            setDeleteProgressMessage("Removing deployment…");
            const attempt = await deleteOnce();
            res = attempt.res;
            data = attempt.data;
            if (res.ok) break;
            if (!(res.status === 409 && data.error === "tenant_busy")) break;
          }
        }

        if (!res.ok) {
          throw new Error(formatApiError(data, data.message ?? data.error ?? `HTTP ${res.status}`));
        }
        setTenants((prev) => prev.filter((t) => t.tenantId !== tenantId));
        setTenantAccess(null);
        setOneTimePassword(null);
        void load().catch(() => {});
      } catch (e) {
        const message = String(e);
        if (message.includes("tenant_not_found")) {
          setTenants((prev) => prev.filter((t) => t.tenantId !== tenantId));
          setError(`Tenant "${slug}" was already removed.`);
          void load().catch(() => {});
          return;
        }
        setError(message);
      } finally {
        setDeletingId(null);
        setDeleteProgressMessage(null);
        setDeleteConfirmOpen(false);
        setDeleteVolumesOpen(false);
        setDeleteTarget(null);
        setDeleteSlugInput("");
      }
    },
    [load],
  );

  const isDeletingTenant =
    deleteTarget != null && deletingId === deleteTarget.tenantId;

  const handleSuspend = useCallback(
    async (tenantId: string, slug: string): Promise<boolean> => {
      setSuspendingId(tenantId);
      setError(null);
      try {
        const res = await fetch(`/api/tenants/${tenantId}/suspend`, {
          method: "POST",
        });
        const data = (await readJson(res)) as { error?: string };
        if (!res.ok) throw new Error(formatApiError(data, data.error ?? `HTTP ${res.status}`));
        setTenants((prev) =>
          prev.map((t) =>
            t.tenantId === tenantId
              ? { ...t, deploymentStatus: "suspended", lastError: null }
              : t,
          ),
        );
        return true;
      } catch (e) {
        const message = String(e);
        if (message.includes("tenant_not_found")) {
          setTenants((prev) => prev.filter((t) => t.tenantId !== tenantId));
          setError(`Tenant "${slug}" no longer exists.`);
          void load().catch(() => {});
          return false;
        }
        setError(`Failed to suspend ${slug}: ${message}`);
        return false;
      } finally {
        setSuspendingId(null);
      }
    },
    [load],
  );

  const handleReactivate = useCallback(
    async (tenantId: string, slug: string): Promise<boolean> => {
      setReactivatingId(tenantId);
      setError(null);
      try {
        const res = await fetch(`/api/tenants/${tenantId}/reactivate`, {
          method: "POST",
        });
        const data = (await readJson(res)) as { error?: string };
        if (!res.ok) throw new Error(formatApiError(data, data.error ?? `HTTP ${res.status}`));
        setTenants((prev) =>
          prev.map((t) =>
            t.tenantId === tenantId
              ? { ...t, deploymentStatus: "active", lastError: null }
              : t,
          ),
        );
        return true;
      } catch (e) {
        const message = String(e);
        if (message.includes("tenant_not_found")) {
          setTenants((prev) => prev.filter((t) => t.tenantId !== tenantId));
          setError(`Tenant "${slug}" no longer exists.`);
          void load().catch(() => {});
          return false;
        }
        setError(`Failed to reactivate ${slug}: ${message}`);
        return false;
      } finally {
        setReactivatingId(null);
      }
    },
    [load],
  );

  const handleStopProvision = useCallback(
    async (tenantId: string, slug: string): Promise<boolean> => {
      setStoppingId(tenantId);
      setError(null);
      try {
        const res = await fetch(`/api/tenants/${tenantId}/provision-stop`, {
          method: "POST",
        });
        const data = (await readJson(res)) as { error?: string; status?: string };
        if (!res.ok) throw new Error(formatApiError(data, data.error ?? `HTTP ${res.status}`));
        const statusLabel = data.status ?? "ok";
        setError(`Provision stop requested for ${slug} (${statusLabel}).`);
        await load();
        return true;
      } catch (e) {
        setError(`Failed to stop provisioning for ${slug}: ${String(e)}`);
        return false;
      } finally {
        setStoppingId(null);
      }
    },
    [load],
  );

  useEffect(() => {
    load().catch((e) => setError(String(e)));
  }, [load]);

  useEffect(() => {
    if (searchParams.get("provision") !== "1") return;
    setAddTenantOpen(true);
    router.replace("/tenants", { scroll: false });
  }, [searchParams, router]);

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
        throw new Error(formatApiError(sj, msg));
      }

      if (!sr.ok) {
        throw new Error(
          formatApiError(sj, (sj as { error?: string }).error ?? `status HTTP ${sr.status}`),
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
          formatApiError(
            f,
            [f.error, f.cause].filter(Boolean).join(" — "),
          ),
        );
      }

      if ("status" in sj && sj.status === "complete") {
        const ok = sj as ProvisionPollComplete;
        setOneTimePassword((prev) => ok.oneTimeAdminPassword ?? prev ?? null);
        if (ok.ready === true) {
          await load();
          return ok;
        }
        const reasons = ok.readiness?.reasons?.length
          ? ok.readiness.reasons.join(", ")
          : "readiness checks still converging";
        setError(
          `Provisioning completed but tenant is not ready yet (${reasons}). Waiting for readiness...`,
        );
      }
    }
    const finalRes = await fetch(`/api/tenants/provision-status/${correlationId}`);
    const finalJson = (await readJson(finalRes)) as
      | ProvisionPollFailed
      | { error?: string; cause?: string; message?: string; status?: string };
    if ("status" in finalJson && finalJson.status === "failed") {
      const fail = finalJson as ProvisionPollFailed;
      throw new Error(
        formatApiError(fail, [fail.error, fail.cause].filter(Boolean).join(" — ")),
      );
    }
    if ("error" in finalJson && typeof finalJson.error === "string" && finalJson.error.length > 0) {
      throw new Error(formatApiError(finalJson, finalJson.error));
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
        throw new Error(formatApiError(data, data.error ?? `HTTP ${res.status}`));
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
    planSlug: string;
    modules: ("accounting" | "pos" | "pms" | "chat")[];
    assignExistingLicenseId: string | null;
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
          plan_slug: payload?.planSlug ?? "starter",
          modules: payload?.modules ?? ["accounting"],
          assign_existing_license_id: payload?.assignExistingLicenseId ?? undefined,
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
        const generatedPublicUrl = tenantPublicBaseUrl(nextSlug, ok.internalPort ?? null);
        const reportedPublicUrl =
          typeof ok.baseUrl === "string" &&
          ok.baseUrl.includes("://") &&
          !ok.baseUrl.match(/^https?:\/\/[^/]+\.localhost(\/|$)/i)
            ? ok.baseUrl
            : null;
        setTenantAccess({
          publicUrl: generatedPublicUrl ?? reportedPublicUrl ?? null,
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
        const base = formatApiError(
          data,
          data.message ?? data.error ?? `HTTP ${res.status}`,
        );
        const detail =
          data.detail && typeof data.detail === "object"
            ? JSON.stringify(data.detail)
            : "";
        setError(
          [base, detail, data.correlationId ? `id:${data.correlationId}` : ""]
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

  const from = listTotal === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, listTotal);

  return (
    <div className="w-full space-y-8">
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
        dialog={{ open: addTenantOpen, onOpenChange: setAddTenantOpen }}
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

      <div className="space-y-4">
        <div className="flex flex-col gap-3 border-b border-border/60 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Existing tenants</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Filter, sort, and manage customer organizations from one directory.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => {
                const params = new URLSearchParams();
                if (search.trim()) params.set("search", search.trim());
                if (statusFilter !== "all") params.set("status", statusFilter);
                params.set("sort", sortOrder);
                const query = params.toString();
                window.location.href = `/api/tenants/export.csv${query ? `?${query}` : ""}`;
              }}
            >
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => load().catch((e) => setError(String(e)))}
            >
              Refresh
            </Button>
            <Button type="button" size="sm" className="h-9" onClick={() => setAddTenantOpen(true)}>
              Add tenant
            </Button>
          </div>
        </div>
        <TenantList
          tenants={tenants}
          directoryTotals={directoryTotals}
          listLoading={listLoading}
          searchQuery={searchInput}
          onSearchQueryChange={(v) => {
            setSearchInput(v);
            setPage(1);
            if (v.trim() === "") {
              setSearch("");
            }
          }}
          statusFilter={statusFilter}
          onStatusFilterChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
          sortOrder={sortOrder}
          onSortOrderChange={(v) => {
            setSortOrder(v);
            setPage(1);
          }}
          onRequestDelete={requestTenantDelete}
          onSuspend={handleSuspend}
          onReactivate={handleReactivate}
          onStopProvision={handleStopProvision}
          deletingId={deletingId}
          suspendingId={suspendingId}
          reactivatingId={reactivatingId}
          stoppingId={stoppingId}
          onAddTenant={() => setAddTenantOpen(true)}
        />
        {directoryTotals && directoryTotals.total > 0 ? (
          <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {from}–{to} of {listTotal} tenants
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <Dialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          setDeleteConfirmOpen(open);
          if (!open) {
            setDeleteSlugInput("");
            setDeleteTarget(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete tenant</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This runs docker compose down, removes the tenant from Stockix, and deletes provision logs. This cannot be
            undone. Type the tenant slug{" "}
            {deleteTarget ? (
              <span className="font-mono font-medium text-foreground">{deleteTarget.slug}</span>
            ) : null}{" "}
            to continue.
          </p>
          <Input
            placeholder="Tenant slug"
            value={deleteSlugInput}
            onChange={(e) => setDeleteSlugInput(e.target.value)}
            autoComplete="off"
          />
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setDeleteConfirmOpen(false);
                setDeleteSlugInput("");
                setDeleteTarget(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!deleteTarget || deleteSlugInput !== deleteTarget.slug}
              onClick={() => {
                if (!deleteTarget || deleteSlugInput !== deleteTarget.slug) return;
                setDeleteConfirmOpen(false);
                setDeleteVolumesOpen(true);
              }}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteVolumesOpen}
        onOpenChange={(open) => {
          if (!open && isDeletingTenant) return;
          setDeleteVolumesOpen(open);
          if (!open) {
            setDeleteTarget(null);
            setDeleteSlugInput("");
          }
        }}
      >
        <DialogContent showCloseButton={!isDeletingTenant}>
          {isDeletingTenant ? (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <Loader2 className="size-10 animate-spin text-primary" aria-hidden />
              <DialogHeader className="space-y-2 text-center sm:text-center">
                <DialogTitle>Deleting tenant</DialogTitle>
              </DialogHeader>
              <p className="max-w-sm text-sm text-muted-foreground">
                {deleteProgressMessage ?? "Removing deployment…"}
              </p>
              {deleteTarget ? (
                <p className="font-mono text-xs text-muted-foreground">{deleteTarget.slug}</p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Do not close this window. This can take up to a minute if the tenant was still running.
              </p>
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Also delete Docker volumes?</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Delete volumes removes MySQL / Mongo / Redis data for this stack. Keep volumes if you may need the data
                later (containers are still removed).
              </p>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  variant="outline"
                  disabled={!deleteTarget}
                  onClick={() => {
                    if (!deleteTarget) return;
                    void executeTenantDelete(deleteTarget.tenantId, deleteTarget.slug, false);
                  }}
                >
                  Keep volumes
                </Button>
                <Button
                  variant="destructive"
                  disabled={!deleteTarget}
                  onClick={() => {
                    if (!deleteTarget) return;
                    void executeTenantDelete(deleteTarget.tenantId, deleteTarget.slug, true);
                  }}
                >
                  Delete volumes
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function TenantsPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full space-y-8 p-6 text-sm text-muted-foreground">Loading tenants…</div>
      }
    >
      <TenantsPageContent />
    </Suspense>
  );
}
