"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { ChevronLeft, ChevronRight, Download } from "lucide-react";

import TenantCreateWizard from "@/components/tenant-create-wizard";
import { TenantList, type TenantSortOrder } from "@/components/tenant-list";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/reusabletoast";
import { useMe } from "@/hooks/use-me";
import { formatApiError } from "@/lib/api-errors";
import { tenantPublicBaseUrl } from "@/lib/tenant-url";
import type { ProvisionEventRow, TenantDirectoryTotals, TenantRow } from "@/types/tenant";

import { TenantAccessBanner } from "./tenant-access-banner";
import {
  TenantPosBootstrapBanner,
  type PosBootstrapCredentialsPayload,
} from "./tenant-pos-bootstrap-banner";
import { TenantDeleteDialogs } from "./tenant-delete-dialogs";
import { TenantProvisionBanner } from "./tenant-provision-banner";
import {
  MAX_WAIT_MS,
  mergeProvisionEvents,
  pollUntilTenantRemoved,
  startElapsedTimer,
  POLL_MS,
  readJson,
  type ProvisionPollComplete,
  type ProvisionPollFailed,
  type ProvisionPollRunning,
} from "./tenants-utils";

export function TenantsPageContent() {
  const { me } = useMe();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialListStatus = useMemo(():
    | "all"
    | "active"
    | "partial"
    | "suspended"
    | "provisioning"
    | "failed" => {
    const s = searchParams.get("status");
    if (
      s === "active" ||
      s === "partial" ||
      s === "suspended" ||
      s === "provisioning" ||
      s === "failed"
    ) {
      return s;
    }
    return "all";
  }, [searchParams]);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oneTimePassword, setOneTimePassword] = useState<string | null>(null);
  const [posDefaultCredentials, setPosDefaultCredentials] =
    useState<PosBootstrapCredentialsPayload | null>(null);
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
  const [deleteProgress, setDeleteProgress] = useState<{
    message: string;
    elapsedSec: number;
    slug: string;
    index?: number;
    total?: number;
  } | null>(null);
  const [selectedTenantIds, setSelectedTenantIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteConfirmInput, setBulkDeleteConfirmInput] = useState("");
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [suspendingId, setSuspendingId] = useState<string | null>(null);
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const [addTenantOpen, setAddTenantOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ tenantId: string; slug: string } | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteVolumesOpen, setDeleteVolumesOpen] = useState(false);
  const [deleteSlugInput, setDeleteSlugInput] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "partial" | "suspended" | "provisioning" | "failed"
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
      statusParam === "partial" ||
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
      setDeleteProgress({
        message: wipeVolumes
          ? "Stopping stacks and removing volumes and images…"
          : "Stopping stacks and removing tenant…",
        elapsedSec: 0,
        slug,
      });
      setError(null);
      try {
        const q = wipeVolumes ? "?volumes=true" : "";
        setDeleteProgress((p) =>
          p ? { ...p, message: "Submitting removal request…" } : p,
        );
        const stopElapsed = startElapsedTimer((elapsedSec) => {
          setDeleteProgress((p) => (p ? { ...p, elapsedSec } : p));
        });
        let res: Response;
        try {
          res = await fetch(`/api/tenants/${tenantId}${q}`, {
            method: "DELETE",
          });
        } finally {
          stopElapsed();
        }
        const data = (await readJson(res)) as {
          error?: string;
          message?: string;
          hardDeleted?: boolean;
          alreadyQueued?: boolean;
        };
        if (!res.ok && res.status !== 202) {
          throw new Error(formatApiError(data, data.message ?? data.error ?? `HTTP ${res.status}`));
        }
        setTenants((prev) =>
          prev.map((t) =>
            t.tenantId === tenantId ? { ...t, tenantStatus: "deprovisioning" } : t,
          ),
        );
        setTenantAccess(null);
        setOneTimePassword(null);
        await pollUntilTenantRemoved(tenantId, (message, elapsedSec) => {
          setDeleteProgress({ message, elapsedSec, slug });
        });
        setTenants((prev) => prev.filter((t) => t.tenantId !== tenantId));
        setSelectedTenantIds((prev) => {
          const next = new Set(prev);
          next.delete(tenantId);
          return next;
        });
        toast.success(`Tenant "${slug}" removed completely.`);
        void load().catch(() => {});
      } catch (e) {
        const message = String(e);
        if (message.includes("tenant_not_found")) {
          setTenants((prev) => prev.filter((t) => t.tenantId !== tenantId));
          toast.success(`Tenant "${slug}" was already removed.`);
          void load().catch(() => {});
          return;
        }
        toast.error(`Could not delete "${slug}": ${message}`);
        setError(message);
      } finally {
        setDeletingId(null);
        setDeleteProgress(null);
        setDeleteConfirmOpen(false);
        setDeleteVolumesOpen(false);
        setDeleteTarget(null);
        setDeleteSlugInput("");
      }
    },
    [load],
  );

  const executeBulkDelete = useCallback(async () => {
    if (bulkDeleteConfirmInput !== "DELETE") return;
    const targets = tenants
      .filter((t) => selectedTenantIds.has(t.tenantId))
      .map((t) => ({ tenantId: t.tenantId, slug: t.slug }));
    if (targets.length === 0) return;

    setIsBulkDeleting(true);
    setError(null);
    const failed: string[] = [];

    for (let i = 0; i < targets.length; i++) {
      const { tenantId, slug } = targets[i]!;
      setDeletingId(tenantId);
      try {
        setDeleteProgress({
          message: "Submitting removal request…",
          elapsedSec: 0,
          slug,
          index: i + 1,
          total: targets.length,
        });
        const stopElapsed = startElapsedTimer((elapsedSec) => {
          setDeleteProgress((p) => (p ? { ...p, elapsedSec } : p));
        });
        let res: Response;
        try {
          res = await fetch(`/api/tenants/${tenantId}?volumes=true`, {
            method: "DELETE",
          });
        } finally {
          stopElapsed();
        }
        const data = (await readJson(res)) as { error?: string; message?: string };
        if (!res.ok && res.status !== 202) {
          throw new Error(formatApiError(data, data.message ?? data.error ?? `HTTP ${res.status}`));
        }
        setTenants((prev) =>
          prev.map((t) =>
            t.tenantId === tenantId ? { ...t, tenantStatus: "deprovisioning" } : t,
          ),
        );
        await pollUntilTenantRemoved(tenantId, (message, elapsedSec) => {
          setDeleteProgress({
            message,
            elapsedSec,
            slug,
            index: i + 1,
            total: targets.length,
          });
        });
        setTenants((prev) => prev.filter((t) => t.tenantId !== tenantId));
        setSelectedTenantIds((prev) => {
          const next = new Set(prev);
          next.delete(tenantId);
          return next;
        });
      } catch (e) {
        const message = String(e);
        if (message.includes("tenant_not_found")) {
          setTenants((prev) => prev.filter((t) => t.tenantId !== tenantId));
          setSelectedTenantIds((prev) => {
            const next = new Set(prev);
            next.delete(tenantId);
            return next;
          });
          continue;
        }
        failed.push(`${slug}: ${message}`);
      }
    }

    setDeletingId(null);
    setDeleteProgress(null);
    setIsBulkDeleting(false);
    setBulkDeleteOpen(false);
    setBulkDeleteConfirmInput("");
    void load().catch(() => {});

    if (failed.length === 0) {
      toast.success(`Removed ${targets.length} tenant${targets.length === 1 ? "" : "s"} completely.`);
    } else if (failed.length < targets.length) {
      toast.error(`Some deletions failed:\n${failed.join("\n")}`);
      setError(failed.join("\n"));
    } else {
      toast.error(`Bulk delete failed:\n${failed.join("\n")}`);
      setError(failed.join("\n"));
    }
  }, [bulkDeleteConfirmInput, load, selectedTenantIds, tenants]);

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
              ? {
                  ...t,
                  tenantStatus: "suspended",
                  deploymentStatus: "suspended",
                  lastError: null,
                }
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
              ? {
                  ...t,
                  tenantStatus: "active",
                  deploymentStatus: "active",
                  lastError: null,
                }
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
    setSelectedTenantIds((prev) => {
      const visible = new Set(tenants.map((t) => t.tenantId));
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [tenants]);

  const selectableTenants = useMemo(
    () =>
      tenants.filter(
        (t) =>
          (t.tenantStatus ?? "").toLowerCase() !== "deprovisioning" &&
          deletingId !== t.tenantId,
      ),
    [tenants, deletingId],
  );

  const bulkDeleteTargets = useMemo(
    () =>
      tenants
        .filter((t) => selectedTenantIds.has(t.tenantId))
        .map((t) => ({ tenantId: t.tenantId, slug: t.slug })),
    [selectedTenantIds, tenants],
  );

  useEffect(() => {
    const hasDeprovisioning = tenants.some(
      (t) => (t.tenantStatus ?? "").toLowerCase() === "deprovisioning",
    );
    if (!hasDeprovisioning) return;
    const interval = window.setInterval(() => {
      load().catch((e) => setError(String(e)));
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [tenants, load]);

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
    es.addEventListener("done", () => {
      es.close();
    });
    es.addEventListener("ping", () => {
      /* keep-alive; ignore payload */
    });
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) return;
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
        if (ok.posDefaultCredentials?.allRoles?.length) {
          setPosDefaultCredentials(ok.posDefaultCredentials);
        }
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

  const canManageTenants = Boolean(me?.capabilities.canManageTenants);

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
          bootstrap admin password is shown only once at the end of provisioning (about 15 minutes in cache).
        </p>
      </div>

      <TenantProvisionBanner
        loading={loading}
        elapsedSec={elapsedSec}
        provisionLog={provisionLog}
        streamCorrelationId={streamCorrelationId}
        stoppingProvision={stoppingProvision}
        stopProvision={stopProvision}
      />

      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <TenantAccessBanner
        oneTimePassword={oneTimePassword}
        tenantAccess={tenantAccess}
      />

      <TenantPosBootstrapBanner posDefaultCredentials={posDefaultCredentials} />

      <TenantCreateWizard
        dialog={{ open: addTenantOpen, onOpenChange: setAddTenantOpen }}
        loading={loading}
        provisionLog={provisionLog}
        elapsedSec={elapsedSec}
        oneTimePassword={oneTimePassword}
        posDefaultCredentials={posDefaultCredentials}
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
          setPosDefaultCredentials(null);
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
            {canManageTenants ? (
              <Button type="button" size="sm" className="h-9" onClick={() => setAddTenantOpen(true)}>
                Add tenant
              </Button>
            ) : null}
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
          canManageTenants={canManageTenants}
          selectedTenantIds={canManageTenants ? selectedTenantIds : undefined}
          onSelectedTenantIdsChange={canManageTenants ? setSelectedTenantIds : undefined}
          selectableTenantIds={
            canManageTenants ? new Set(selectableTenants.map((t) => t.tenantId)) : undefined
          }
          onBulkDelete={
            canManageTenants
              ? () => {
                  setBulkDeleteConfirmInput("");
                  setBulkDeleteOpen(true);
                }
              : undefined
          }
          bulkDeleteDisabled={isBulkDeleting || deletingId != null}
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

      <TenantDeleteDialogs
        deleteConfirmOpen={deleteConfirmOpen}
        setDeleteConfirmOpen={setDeleteConfirmOpen}
        deleteVolumesOpen={deleteVolumesOpen}
        setDeleteVolumesOpen={setDeleteVolumesOpen}
        deleteTarget={deleteTarget}
        setDeleteTarget={setDeleteTarget}
        deleteSlugInput={deleteSlugInput}
        setDeleteSlugInput={setDeleteSlugInput}
        isDeletingTenant={isDeletingTenant}
        deleteProgress={deleteProgress}
        executeTenantDelete={executeTenantDelete}
        bulkDeleteOpen={bulkDeleteOpen}
        setBulkDeleteOpen={setBulkDeleteOpen}
        bulkDeleteTargets={bulkDeleteTargets}
        bulkDeleteConfirmInput={bulkDeleteConfirmInput}
        setBulkDeleteConfirmInput={setBulkDeleteConfirmInput}
        isBulkDeleting={isBulkDeleting}
        executeBulkDelete={executeBulkDelete}
      />
    </div>
  );
}
