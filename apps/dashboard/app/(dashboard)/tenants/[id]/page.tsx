"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { AlertCircle, Copy, ExternalLink, History, Loader2, Minus, PauseCircle, PlayCircle, Plus, RotateCw, Square, Trash2, UserCheck } from "lucide-react";
import { toast } from "@/components/reusabletoast";

import { LicenseAssignDialog } from "@/components/license-assign-dialog";
import LicenseGenerateDialog from "@/components/license-generate-dialog";
import { LicenseExtendDialog } from "@/components/license-extend-dialog";
import LicenseStatusBadge from "@/components/license-status-badge";
import { OrgSwitcher } from "@/components/org-switcher";
import TenantOrgAccessPanel from "@/components/tenant-org-access-panel";
import TenantUsersPanel from "@/components/tenant-users-panel";
import TenantStatusBadge from "@/components/tenant-status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/hooks/use-me";
import { formatApiError } from "@/lib/api-errors";
import { formatDate, formatDateTime, formatTime } from "@/lib/date-format";
import { tenantProfileSchema, type TenantProfileValues } from "@/lib/schemas";
import { tenantPublicBaseUrl } from "@/lib/tenant-url";
import { cn } from "@/lib/utils";
import { moduleLabel } from "@/lib/tenant-modules";
import type { StockixModuleId } from "@/lib/tenant-modules";
import type { LicenseRow, LicenseStatus } from "@/types/license";
import type { ProvisionEventRow, TenantDetail } from "@/types/tenant";

function moduleBadgeVariant(
  mod: string,
): "default" | "secondary" | "outline" {
  if (mod === "accounting") return "default";
  if (mod === "pos") return "secondary";
  return "outline";
}

const MAX_PROVISION_POLL_MS = 45 * 60 * 1000;
const PROVISION_POLL_INTERVAL_MS = 2500;

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const me = useMe();
  const isSuper = me?.role === "super_admin";
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [tenantLicense, setTenantLicense] = useState<LicenseRow | null>(null);
  const [licenseLoading, setLicenseLoading] = useState(true);
  const [genLicenseOpen, setGenLicenseOpen] = useState(false);
  const [revokeLicenseOpen, setRevokeLicenseOpen] = useState(false);
  const [extendLicenseOpen, setExtendLicenseOpen] = useState(false);
  const [revokeLicenseReason, setRevokeLicenseReason] = useState("");
  const [events, setEvents] = useState<ProvisionEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stoppingProvision, setStoppingProvision] = useState(false);
  const [dangerOpen, setDangerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [volumesOpen, setVolumesOpen] = useState(false);
  const [confirmSlug, setConfirmSlug] = useState("");
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [suspendConfirmSlug, setSuspendConfirmSlug] = useState("");
  const [suspendingTenant, setSuspendingTenant] = useState(false);
  const [reactivateDialogOpen, setReactivateDialogOpen] = useState(false);
  const [reactivatingTenant, setReactivatingTenant] = useState(false);
  const [stopProvisionOpen, setStopProvisionOpen] = useState(false);
  const [stopProvisionSlugInput, setStopProvisionSlugInput] = useState("");
  const [retryingProvision, setRetryingProvision] = useState(false);
  const [impersonating, setImpersonating] = useState(false);
  const [provisionPollTimedOut, setProvisionPollTimedOut] = useState(false);
  const provisionPollStartedAtRef = useRef<number | null>(null);
  const [clearingFinancePassword, setClearingFinancePassword] = useState(false);
  const [repairingFinanceLink, setRepairingFinanceLink] = useState(false);
  const [assignPickOpen, setAssignPickOpen] = useState(false);
  const [unassignedPickLoading, setUnassignedPickLoading] = useState(false);
  const [unassignedList, setUnassignedList] = useState<LicenseRow[]>([]);
  const [selectedUnassignedId, setSelectedUnassignedId] = useState("");
  const [licenseForAssign, setLicenseForAssign] = useState<LicenseRow | null>(null);
  const [assignLicenseOpen, setAssignLicenseOpen] = useState(false);
  const [licenseHistory, setLicenseHistory] = useState<LicenseRow[]>([]);
  const [licenseHistoryLoading, setLicenseHistoryLoading] = useState(false);
  const [licenseHistoryOpen, setLicenseHistoryOpen] = useState(false);
  const [posCredentialsOpen, setPosCredentialsOpen] = useState(false);
  const [posCredentialsLoading, setPosCredentialsLoading] = useState(false);
  const [posCredentials, setPosCredentials] = useState<
    { role: string; username: string; pin: string }[]
  >([]);
  const [posPinResettingRole, setPosPinResettingRole] = useState<string | null>(null);
  const [addModuleOpen, setAddModuleOpen] = useState(false);
  const [addModuleChoice, setAddModuleChoice] = useState<"pos" | "pms" | "chat">("pos");
  const [addingModule, setAddingModule] = useState(false);
  const [removeModuleOpen, setRemoveModuleOpen] = useState(false);
  const [moduleToRemove, setModuleToRemove] = useState<"pos" | "pms" | "chat" | null>(null);
  const [removingModule, setRemovingModule] = useState(false);
  const profileForm = useForm<TenantProfileValues>({
    resolver: zodResolver(tenantProfileSchema),
    defaultValues: {
      name: "",
      adminFirstName: "",
      adminLastName: "",
      adminEmail: "",
    },
  });

  const loadTenant = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tenants/${id}`);
      const body = await readJson(res);
      const data = body as { error?: string; tenant?: TenantDetail };
      if (!res.ok || !data.tenant) {
        throw new Error(formatApiError(body, data.error ?? `HTTP ${res.status}`));
      }
      setTenant(data.tenant);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const loadLicense = async () => {
    setLicenseLoading(true);
    try {
      const res = await fetch(
        `/api/licenses?tenantId=${encodeURIComponent(id)}&pageSize=1&primary=1`,
      );
      const data = (await readJson(res)) as { licenses?: LicenseRow[] };
      if (res.ok && data.licenses?.[0]) setTenantLicense(data.licenses[0]!);
      else setTenantLicense(null);
    } finally {
      setLicenseLoading(false);
    }
  };

  const loadLicenseHistory = useCallback(async () => {
    setLicenseHistoryLoading(true);
    try {
      const res = await fetch(`/api/licenses?tenantId=${encodeURIComponent(id)}&pageSize=50`);
      const data = (await readJson(res)) as { licenses?: LicenseRow[] };
      if (res.ok) setLicenseHistory(data.licenses ?? []);
      else setLicenseHistory([]);
    } finally {
      setLicenseHistoryLoading(false);
    }
  }, [id]);

  const loadEvents = async () => {
    setEventsLoading(true);
    try {
      const res = await fetch(`/api/tenants/${id}/events`);
      const body = await readJson(res);
      const data = body as { events?: ProvisionEventRow[]; error?: string };
      if (!res.ok) {
        setError(formatApiError(body, data.error ?? `Failed to load events (HTTP ${res.status})`));
        setEvents([]);
        return;
      }
      setEvents(data.events ?? []);
    } catch (e) {
      setError(`Failed to load events: ${String(e)}`);
      setEvents([]);
    } finally {
      setEventsLoading(false);
    }
  };

  useEffect(() => {
    void loadTenant();
    void loadEvents();
    void loadLicense();
  }, [id]);

  useEffect(() => {
    if (!tenant) return;
    profileForm.reset({
      name: tenant.name,
      adminFirstName: tenant.adminFirstName,
      adminLastName: tenant.adminLastName,
      adminEmail: tenant.adminEmail,
    });
  }, [tenant, profileForm]);

  useEffect(() => {
    if (!licenseHistoryOpen) return;
    void loadLicenseHistory();
  }, [licenseHistoryOpen, loadLicenseHistory]);

  const deploymentStatus = (tenant?.deployment?.status ?? tenant?.status ?? "").toLowerCase();
  const tenantStatus = (tenant?.status ?? "").toLowerCase();
  const isProvisioning =
    deploymentStatus === "provisioning"
    || deploymentStatus === "pending"
    || deploymentStatus === "queued"
    || tenantStatus === "provisioning"
    || tenantStatus === "queued";
  const shouldPollProvisioning =
    (deploymentStatus === "provisioning"
      || deploymentStatus === "pending"
      || deploymentStatus === "queued"
      || tenantStatus === "provisioning"
      || tenantStatus === "queued")
    && !provisionPollTimedOut;

  useEffect(() => {
    if (!tenant || !shouldPollProvisioning) {
      provisionPollStartedAtRef.current = null;
      if (!shouldPollProvisioning) {
        setProvisionPollTimedOut(false);
      }
      return;
    }
    if (provisionPollStartedAtRef.current == null) {
      provisionPollStartedAtRef.current = Date.now();
    }

    const intervalId = window.setInterval(() => {
      const startedAt = provisionPollStartedAtRef.current ?? Date.now();
      if (Date.now() - startedAt >= MAX_PROVISION_POLL_MS) {
        setProvisionPollTimedOut(true);
        return;
      }
      void loadTenant();
      void loadEvents();
    }, PROVISION_POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [tenant, shouldPollProvisioning]);

  const clearFinancePassword = async () => {
    if (!tenant) return;
    setClearingFinancePassword(true);
    try {
      const res = await fetch(`/api/tenants/${tenant.id}/finance-password`, {
        method: "DELETE",
      });
      const body = await readJson(res);
      if (!res.ok) {
        throw new Error(formatApiError(body, "Could not clear Finance credentials"));
      }
      toast.success("Finance credentials cleared from dashboard");
      await loadTenant();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not clear Finance credentials");
    } finally {
      setClearingFinancePassword(false);
    }
  };

  const repairFinanceLink = async () => {
    if (!tenant) return;
    setRepairingFinanceLink(true);
    try {
      const res = await fetch(`/api/tenants/${tenant.id}/repair-finance-link`, {
        method: "POST",
      });
      const body = await readJson(res);
      if (!res.ok) {
        toast.error(formatApiError(body, "Could not link Finance tenant."));
        return;
      }
      toast.success("Finance tenant linked.");
      await loadTenant();
    } finally {
      setRepairingFinanceLink(false);
    }
  };

  useEffect(() => {
    if (!assignPickOpen || !isSuper) return;
    setUnassignedPickLoading(true);
    void (async () => {
      try {
        const res = await fetch("/api/licenses?status=unassigned&pageSize=100");
        const data = (await readJson(res)) as { licenses?: LicenseRow[] };
        if (res.ok && data.licenses?.length) {
          setUnassignedList(data.licenses);
          setSelectedUnassignedId(data.licenses[0]!.id);
        } else {
          setUnassignedList([]);
          setSelectedUnassignedId("");
        }
      } finally {
        setUnassignedPickLoading(false);
      }
    })();
  }, [assignPickOpen, isSuper]);

  const baseUrl = useMemo(() => {
    if (!tenant) return null;
    return tenantPublicBaseUrl(tenant.slug, tenant.deployment?.internalPort ?? null);
  }, [tenant]);

  const posUrl = useMemo(() => {
    const stored = tenant?.deployment?.posUrl?.trim();
    return stored && stored.length > 0 ? stored : null;
  }, [tenant]);

  const tenantModules = tenant?.modules ?? [];
  const hasPosModule = tenantModules.includes("pos");
  const hasAccountingModule = tenantModules.includes("accounting");
  const hasAccountingAndPos = hasAccountingModule && hasPosModule;
  const addableModules = (["pos", "pms", "chat"] as const).filter(
    (mod) => !tenantModules.includes(mod),
  );
  const canRevealPosPins = Boolean(
    me?.capabilities.canManageTenants && tenant?.posOrganizationId,
  );

  const posOrgHref = useMemo(() => {
    if (tenant?.posOrganizationId) {
      return `/pos/organizations/${tenant.posOrganizationId}`;
    }
    return "/pos/organizations";
  }, [tenant?.posOrganizationId]);

  const copyProvisionId = async (label: string, value: number | null | undefined) => {
    if (value == null) return;
    try {
      await navigator.clipboard.writeText(String(value));
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Could not copy ${label}`);
    }
  };

  const copyText = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Could not copy ${label}`);
    }
  };

  const addModule = async () => {
    if (!id) return;
    setAddingModule(true);
    try {
      const res = await fetch(`/api/tenants/${id}/add-module`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module: addModuleChoice }),
      });
      const body = await readJson(res);
      if (!res.ok) {
        throw new Error(formatApiError(body, `HTTP ${res.status}`));
      }
      toast.success(`Module ${moduleLabel(addModuleChoice)} added — provisioning started`);
      setAddModuleOpen(false);
      await loadTenant();
      await loadEvents();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setAddingModule(false);
    }
  };

  const removeModule = async () => {
    if (!id || !moduleToRemove) return;
    setRemovingModule(true);
    try {
      const res = await fetch(`/api/tenants/${id}/remove-module`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module: moduleToRemove }),
      });
      const body = await readJson(res);
      if (!res.ok) {
        throw new Error(formatApiError(body, `HTTP ${res.status}`));
      }
      toast.success(`Module ${moduleLabel(moduleToRemove)} removed (data retained)`);
      setRemoveModuleOpen(false);
      setModuleToRemove(null);
      await loadTenant();
      await loadLicense();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setRemovingModule(false);
    }
  };

  const openRemoveModule = (mod: "pos" | "pms" | "chat") => {
    setModuleToRemove(mod);
    setRemoveModuleOpen(true);
  };

  const loadPosCredentials = async () => {
    if (!id) return;
    setPosCredentialsLoading(true);
    try {
      const res = await fetch(`/api/tenants/${id}/pos-credentials`);
      const body = (await readJson(res)) as {
        roles?: { role: string; username: string; pin: string }[];
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        throw new Error(formatApiError(body, "Could not load POS credentials"));
      }
      setPosCredentials(Array.isArray(body.roles) ? body.roles : []);
      setPosCredentialsOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load POS credentials");
    } finally {
      setPosCredentialsLoading(false);
    }
  };

  const resetPosPin = async (role: string) => {
    if (!id) return;
    setPosPinResettingRole(role);
    try {
      const res = await fetch(`/api/tenants/${id}/pos-credentials/reset-pin`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const body = (await readJson(res)) as {
        roles?: { role: string; username: string; pin: string }[];
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        throw new Error(formatApiError(body, "Could not reset PIN"));
      }
      setPosCredentials(Array.isArray(body.roles) ? body.roles : []);
      toast.success(`New PIN issued for ${role}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reset PIN");
    } finally {
      setPosPinResettingRole(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-60" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error || !tenant) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Failed to load tenant</AlertTitle>
        <AlertDescription>{error ?? "Tenant not found"}</AlertDescription>
      </Alert>
    );
  }

  const provisionFailed = deploymentStatus === "failed" || tenant.status === "failed";
  const provisionPartial = tenant.status === "partial";

  const saveProfile = profileForm.handleSubmit(async (values) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/tenants/${tenant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = await readJson(res);
      const data = body as { tenant?: TenantDetail; error?: string };
      if (!res.ok || !data.tenant) {
        throw new Error(formatApiError(body, data.error ?? `HTTP ${res.status}`));
      }
      setTenant(data.tenant);
      setEditing(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  });

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/tenants">Tenants</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{tenant.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {provisionPollTimedOut && isProvisioning ? (
        <Alert className="border-amber-500/50 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-50">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Provisioning is taking longer than expected</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              Auto-refresh paused after {MAX_PROVISION_POLL_MS / 60000} minutes. Check provisioning
              events below, worker logs, and Docker — then refresh manually or stop provisioning.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setProvisionPollTimedOut(false);
                  provisionPollStartedAtRef.current = Date.now();
                  void loadTenant();
                  void loadEvents();
                }}
              >
                <RotateCw className="mr-1 h-4 w-4" />
                Resume auto-refresh
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  void loadTenant();
                  void loadEvents();
                }}
              >
                Refresh now
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setStopProvisionOpen(true)}
              >
                <Square className="mr-1 h-4 w-4" />
                Stop provisioning
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {provisionPartial ? (
        <Alert className="border-amber-500/50 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-50">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Partial provisioning</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              {tenant.deployment?.lastError
                ? tenant.deployment.lastError
                : "Finance completed, but POS provisioning or Bigcapital integration wiring did not finish successfully."}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-amber-600/40"
              disabled={retryingProvision}
              onClick={async () => {
                setRetryingProvision(true);
                setError(null);
                try {
                  const res = await fetch(`/api/tenants/${tenant.id}/retry-provision`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ retryPosOnly: true }),
                  });
                  const data = (await readJson(res)) as { error?: string; message?: string };
                  if (!res.ok) {
                    setError(formatApiError(data, data.message ?? data.error ?? `HTTP ${res.status}`));
                    return;
                  }
                  toast.success("POS provisioning retry queued");
                  await loadTenant();
                  await loadEvents();
                } finally {
                  setRetryingProvision(false);
                }
              }}
            >
              {retryingProvision ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <RotateCw className="mr-1 h-4 w-4" />
              )}
              Retry POS only
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Tenant Profile</CardTitle>
            {!editing ? (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                Edit profile
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-3">
            {!editing ? (
              <>
                <h2 className="text-2xl font-bold">{tenant.name}</h2>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="font-mono">
                    {tenant.slug}
                  </Badge>
                  <TenantStatusBadge
                    status={
                      tenant.status === "partial"
                        ? tenant.status
                        : (tenant.deployment?.status ?? tenant.status)
                    }
                  />
                </div>
                <div className="grid gap-2 text-sm md:grid-cols-2">
                  <p>Admin email: {tenant.adminEmail}</p>
                  <p>Admin first name: {tenant.adminFirstName}</p>
                  <p>Admin last name: {tenant.adminLastName}</p>
                  <p>Owner ID: <span className="font-mono">{tenant.ownerId}</span></p>
                  <p>Plan: <span className="capitalize">{tenant.planSlug}</span></p>
                  <p>Created: {formatDateTime(tenant.createdAt)}</p>
                </div>
                <div className="space-y-2 pt-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label>Licensed modules</Label>
                    {isSuper && addableModules.length > 0 ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setAddModuleChoice(addableModules[0] ?? "pos");
                          setAddModuleOpen(true);
                        }}
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        Add module
                      </Button>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {tenant.modules.length > 0 ? (
                      tenant.modules.map((mod) => (
                        <div key={mod} className="flex items-center gap-1">
                          <Badge variant={moduleBadgeVariant(mod)}>
                            {moduleLabel(mod as StockixModuleId)}
                          </Badge>
                          {isSuper &&
                          (mod === "pos" || mod === "pms" || mod === "chat") &&
                          tenant.modules.length > 1 ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              title={`Remove ${moduleLabel(mod as StockixModuleId)}`}
                              onClick={() =>
                                openRemoveModule(mod as "pos" | "pms" | "chat")
                              }
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">None configured</span>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <Form {...profileForm}>
                <form
                  onSubmit={(e) => void saveProfile(e)}
                  className="space-y-3"
                  noValidate
                >
                  <FormField
                    control={profileForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Business name</FormLabel>
                        <FormControl>
                          <Input placeholder="Business name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={profileForm.control}
                    name="adminEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Admin email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="admin@example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={profileForm.control}
                    name="adminFirstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Admin first name</FormLabel>
                        <FormControl>
                          <Input placeholder="First name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={profileForm.control}
                    name="adminLastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Admin last name</FormLabel>
                        <FormControl>
                          <Input placeholder="Last name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex gap-2">
                    <Button type="submit" disabled={saving}>
                      {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                      Save changes
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setEditing(false);
                        profileForm.reset({
                          name: tenant.name,
                          adminFirstName: tenant.adminFirstName,
                          adminLastName: tenant.adminLastName,
                          adminEmail: tenant.adminEmail,
                        });
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </Form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Infrastructure</CardTitle>
            <div className="flex flex-wrap gap-2">
              {provisionFailed ? (
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  disabled={retryingProvision}
                  onClick={async () => {
                    setRetryingProvision(true);
                    setError(null);
                    try {
                      const res = await fetch(`/api/tenants/${tenant.id}/retry-provision`, {
                        method: "POST",
                      });
                      const data = (await readJson(res)) as { error?: string; message?: string };
                      if (!res.ok) {
                        setError(formatApiError(data, data.message ?? data.error ?? `HTTP ${res.status}`));
                        return;
                      }
                      toast.success("Provisioning restarted");
                      await loadTenant();
                      await loadEvents();
                    } finally {
                      setRetryingProvision(false);
                    }
                  }}
                >
                  {retryingProvision ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <RotateCw className="mr-1 h-4 w-4" />
                  )}
                  Retry provisioning
                </Button>
              ) : null}
              {tenant.deployment?.status === "active" && (baseUrl || posUrl) ? (
                <>
                  {baseUrl ? (
                    <a
                      href={`${baseUrl}/auth/login`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={buttonVariants({ size: "sm" })}
                    >
                      <ExternalLink className="mr-1 h-4 w-4" />
                      Finance login
                    </a>
                  ) : null}
                  {posUrl ? (
                    <a
                      href={posUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={buttonVariants({ size: "sm", variant: "outline" })}
                    >
                      <ExternalLink className="mr-1 h-4 w-4" />
                      Open POS
                    </a>
                  ) : null}
                  {isSuper ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={impersonating}
                      onClick={async () => {
                        setImpersonating(true);
                        try {
                          const res = await fetch(`/api/tenants/${tenant.id}/impersonate`, {
                            method: "POST",
                          });
                          const data = (await readJson(res)) as {
                            error?: string;
                            message?: string;
                            impersonateUrl?: string;
                          };
                          if (!res.ok) {
                            toast.error(data.message ?? "Failed to impersonate tenant");
                            return;
                          }
                          if (!data.impersonateUrl) {
                            toast.error("Failed to impersonate tenant");
                            return;
                          }
                          window.open(data.impersonateUrl, "_blank", "noopener");
                          toast.success("Impersonation session opened in new tab");
                        } catch {
                          toast.error("Failed to impersonate tenant");
                        } finally {
                          setImpersonating(false);
                        }
                      }}
                    >
                      {impersonating ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <UserCheck className="mr-2 h-4 w-4" />
                      )}
                      Impersonate
                    </Button>
                  ) : null}
                </>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <TenantStatusBadge
              status={
                tenant.status === "partial"
                  ? tenant.status
                  : (tenant.deployment?.status ?? tenant.status)
              }
            />
            <p>Internal port: <span className="font-mono">{tenant.deployment?.internalPort ?? "-"}</span></p>
            <p>Compose project: <span className="font-mono">{tenant.deployment?.composeProjectName ?? "-"}</span></p>
            <p>
              Registration completed:{" "}
              {tenant.deployment?.registrationCompletedAt
                ? formatDateTime(tenant.deployment.registrationCompletedAt)
                : "Not yet registered"}
            </p>
            {tenant.deployment?.lastError ? (
              <Alert variant="destructive">
                <AlertDescription>{tenant.deployment.lastError}</AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>

        {hasAccountingModule &&
        (tenant.deployment?.status ?? "").toLowerCase() === "active" &&
        tenant.deployment?.financeAdminPassword ? (
          <Card className="md:col-span-3">
            <CardHeader>
              <CardTitle>Finance admin credentials</CardTitle>
              <CardDescription>
                This password works until the admin logs in and changes it. After first login it is
                permanently invalidated. Clear it from the dashboard once the tenant admin confirms
                they can sign in.
                {isSuper ? " Super admins can use Impersonate for support access." : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">Email</p>
                  <p className="mt-1 font-mono text-xs">{tenant.adminEmail}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  aria-label="Copy admin email"
                  onClick={() => {
                    void navigator.clipboard.writeText(tenant.adminEmail);
                    toast.success("Copied admin email");
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">Temporary password</p>
                  <p className="mt-1 break-all font-mono text-xs">
                    {tenant.deployment.financeAdminPassword}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  aria-label="Copy temporary password"
                  onClick={() => {
                    void navigator.clipboard.writeText(tenant.deployment!.financeAdminPassword!);
                    toast.success("Copied temporary password");
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              {tenant.deployment.publicUrl || baseUrl ? (
                <div className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground">Login URL</p>
                    <p className="mt-1 break-all font-mono text-xs">
                      {tenant.deployment.publicUrl ?? baseUrl}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    aria-label="Copy login URL"
                    onClick={() => {
                      const url = tenant.deployment?.publicUrl ?? baseUrl ?? "";
                      void navigator.clipboard.writeText(url);
                      toast.success("Copied login URL");
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : null}
              <Alert>
                <AlertDescription>
                  Clear this password from the dashboard manually after the tenant admin confirms
                  they have logged in.
                </AlertDescription>
              </Alert>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={clearingFinancePassword}
                onClick={() => void clearFinancePassword()}
              >
                {clearingFinancePassword ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : null}
                Mark credentials as delivered — clear from dashboard
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {hasPosModule ? (
          <Card className="md:col-span-3">
            <CardHeader>
              <CardTitle>POS</CardTitle>
              <CardDescription>
                Point-of-sale stack for this tenant
                {tenant.posOrganizationId ? (
                  <>
                    {" "}
                    ·{" "}
                    <Link href={posOrgHref} className="text-primary underline-offset-4 hover:underline">
                      View POS organization
                    </Link>
                  </>
                ) : null}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {posUrl ? (
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={posUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(buttonVariants({ size: "sm" }), "inline-flex")}
                  >
                    <ExternalLink className="mr-1 h-4 w-4" />
                    Open POS
                  </a>
                  <span className="font-mono text-xs text-muted-foreground">{posUrl}</span>
                </div>
              ) : (
                <p className="text-muted-foreground">
                  POS URL is not set yet. Complete provisioning or retry the POS stack.
                </p>
              )}
              {tenant.posBootstrapCredentials ? (
                <div className="space-y-2 rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-foreground">Bootstrap credentials</p>
                    {canRevealPosPins ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={posCredentialsLoading}
                        onClick={() => void loadPosCredentials()}
                      >
                        {posCredentialsLoading ? (
                          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        ) : null}
                        Reveal Staff PINs
                      </Button>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    PINs are masked here. Use Reveal Staff PINs to fetch live credentials from the
                    POS platform (requires manage-tenant access).
                  </p>
                  <p>
                    Admin PIN:{" "}
                    <span className="font-mono">{tenant.posBootstrapCredentials.adminPinMasked}</span>
                  </p>
                  {tenant.posBootstrapCredentials.allRoles.length > 0 ? (
                    <ul className="space-y-1 font-mono text-xs">
                      {tenant.posBootstrapCredentials.allRoles.map((row) => (
                        <li key={`${row.role}-${row.username}`}>
                          {row.role} / {row.username}: {row.pinMasked}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : canRevealPosPins ? (
                <div className="space-y-2 rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-foreground">Staff PINs</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={posCredentialsLoading}
                      onClick={() => void loadPosCredentials()}
                    >
                      {posCredentialsLoading ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : null}
                      Reveal Staff PINs
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Provision-time PIN cache is unavailable. Reveal loads current PINs from the POS
                    organization.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Bootstrap PINs are only available briefly after provisioning (from provision
                  status or this page while the encrypted secret event is still stored).
                </p>
              )}
            </CardContent>
          </Card>
        ) : null}

        {hasAccountingAndPos ? (
          <Card className="md:col-span-3">
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <CardTitle>Finance ↔ POS integration</CardTitle>
                <CardDescription>
                  When both modules provision successfully, Bigcapital integration is enabled automatically
                  in POS. Map menu items to Finance items in POS before paid orders sync. IDs below are
                  for debugging.
                </CardDescription>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {(!tenant.deployment?.financeTenantId ||
                  tenant.deployment.financeTenantId <= 0) &&
                (tenant.deployment?.status ?? "").toLowerCase() === "active" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={repairingFinanceLink}
                    onClick={() => void repairFinanceLink()}
                  >
                    {repairingFinanceLink ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <RotateCw className="mr-1 h-4 w-4" />
                    )}
                    Repair Finance link
                  </Button>
                ) : null}
                <Link
                  href={posOrgHref}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")}
                >
                  POS organizations
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {[
                {
                  label: "Finance tenant ID",
                  value: tenant.deployment?.financeTenantId,
                  configKey: "financeTenantId",
                },
                {
                  label: "Walk-in customer ID",
                  value: tenant.deployment?.financeWalkInCustomerId,
                  configKey: "defaultWalkInCustomerId",
                },
                {
                  label: "Cash deposit account ID",
                  value: tenant.deployment?.financeCashAccountId,
                  configKey: "defaultCashDepositAccountId",
                },
                {
                  label: "Card deposit account ID",
                  value: tenant.deployment?.financeCardAccountId,
                  configKey: "defaultCardDepositAccountId",
                },
                {
                  label: "Default warehouse ID",
                  value: tenant.deployment?.financeDefaultWarehouseId,
                  configKey: "defaultWarehouseId",
                },
              ].map((row) => (
                <div
                  key={row.configKey}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{row.label}</p>
                    <p className="text-xs text-muted-foreground">
                      POS field: <span className="font-mono">{row.configKey}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">
                      {row.value != null ? row.value : "—"}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      disabled={row.value == null}
                      aria-label={`Copy ${row.label}`}
                      onClick={() => void copyProvisionId(row.label, row.value)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
              {!tenant.deployment?.financeWalkInCustomerId &&
              !tenant.deployment?.financeCashAccountId ? (
                <p className="text-xs text-muted-foreground">
                  IDs appear after provisioning completes with accounting and POS modules.
                </p>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
      </div>

      <div className="mt-6">
        <h2 className="text-lg font-semibold mb-1">Sub-organizations of {tenant.name}</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Child organizations each run their own Bigcapital stack under this tenant. Use the links below for local
          development (host port is required).
        </p>
        <OrgSwitcher tenantId={tenant.id} />
      </div>

      {isSuper ? (
        <div className="mt-6">
          <TenantOrgAccessPanel tenantId={tenant.id} />
        </div>
      ) : null}

      <div className="mt-6">
        <TenantUsersPanel
          tenantId={tenant.id}
          hasAccountingModule={tenant.modules.includes("accounting")}
          deploymentReady={
            !isProvisioning &&
            (tenant.deployment?.status ?? "").toLowerCase() === "active" &&
            tenant.deployment != null &&
            Number(tenant.deployment.internalPort) > 0
          }
          financeTenantId={tenant.deployment?.financeTenantId ?? null}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>License</CardTitle>
          <CardDescription>Software license assigned to this tenant</CardDescription>
        </CardHeader>
        <CardContent>
          {licenseLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : tenantLicense ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm">{tenantLicense.licenseKey}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        void navigator.clipboard.writeText(tenantLicense.licenseKey);
                        toast.success("Copied");
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <LicenseStatusBadge status={tenantLicense.status as LicenseStatus} />
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">
                      {tenantLicense.product === "pos_desktop"
                        ? "POS Desktop"
                        : tenantLicense.product === "bundle"
                          ? "Bundle"
                          : "Platform"}
                    </Badge>
                    <Badge variant="secondary" className="capitalize">
                      {tenantLicense.planSlug}
                    </Badge>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <p>
                    Valid from:{" "}
                    {tenantLicense.validFrom
                      ? format(new Date(tenantLicense.validFrom), "PP")
                      : tenantLicense.activatedAt
                        ? format(new Date(tenantLicense.activatedAt), "PP")
                        : "—"}
                  </p>
                  <p>
                    Expires:{" "}
                    {tenantLicense.isPerpetual ? (
                      <Badge variant="secondary">Perpetual — no expiry</Badge>
                    ) : tenantLicense.expiresAt ? (
                      <>
                        {format(new Date(tenantLicense.expiresAt), "PP")}
                        {(() => {
                          const days = Math.ceil(
                            (new Date(tenantLicense.expiresAt!).getTime() - Date.now()) /
                              (1000 * 60 * 60 * 24),
                          );
                          if (days > 0 && days <= 30 && tenantLicense.status === "active") {
                            return (
                              <Badge variant="destructive" className="ml-2">
                                Expires in {days} day{days === 1 ? "" : "s"}
                              </Badge>
                            );
                          }
                          return null;
                        })()}
                      </>
                    ) : (
                      "—"
                    )}
                  </p>
                  {tenantLicense.modules && tenantLicense.modules.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-muted-foreground">License modules:</span>
                      {tenantLicense.modules.map((mod) => (
                        <Badge key={mod} variant="outline" className="capitalize">
                          {moduleLabel(mod as StockixModuleId)}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  <p>
                    Activations:{" "}
                    {tenantLicense.product === "platform"
                      ? "—"
                      : `${tenantLicense.activationCount} / ${tenantLicense.maxActivations}`}
                  </p>
                  <p>Grace period: {tenantLicense.gracePeriodDays} days</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                <Link
                  href={`/licenses/${tenantLicense.id}`}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "inline-flex",
                  )}
                >
                  View full license details
                </Link>
                {isSuper && tenantLicense.status === "active" ? (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setExtendLicenseOpen(true)}>
                      Extend
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setRevokeLicenseOpen(true)}>
                      Revoke
                    </Button>
                  </>
                ) : null}
              </div>
              <div className="border-t pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto px-0 text-muted-foreground hover:text-foreground"
                  onClick={() => setLicenseHistoryOpen((o) => !o)}
                >
                  <History className="mr-1 h-4 w-4" />
                  {licenseHistoryOpen ? "Hide" : "Show"} license history
                  {licenseHistory.length > 0 ? ` (${licenseHistory.length})` : null}
                </Button>
                {licenseHistoryOpen ? (
                  licenseHistoryLoading ? (
                    <Skeleton className="mt-3 h-24 w-full" />
                  ) : licenseHistory.length === 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">No license rows returned for this tenant.</p>
                  ) : (
                    <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto text-xs">
                      {licenseHistory.map((lic) => (
                        <li key={lic.id} className="flex flex-wrap items-center justify-between gap-2 rounded border bg-muted/20 p-2">
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono">{lic.licenseKey.slice(-12)}…</span>
                              <LicenseStatusBadge status={lic.status as LicenseStatus} />
                            </div>
                            <p className="text-muted-foreground">
                              {lic.planSlug} · created {formatDate(lic.createdAt)}
                              {lic.id === tenantLicense.id ? " · current" : ""}
                            </p>
                          </div>
                          <Link
                            href={`/licenses/${lic.id}`}
                            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")}
                          >
                            Open
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )
                ) : null}
              </div>
            </div>
          ) : (
            <Alert className="border-amber-500/40 bg-amber-500/10">
              <AlertTitle>No license assigned</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>This tenant does not have an active license.</p>
                {isSuper ? (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => setGenLicenseOpen(true)}>
                      Generate &amp; assign license
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setAssignPickOpen(true);
                      }}
                    >
                      Assign existing license
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm">Ask a super admin to generate or assign a license.</p>
                )}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <LicenseGenerateDialog
        open={genLicenseOpen}
        onOpenChange={setGenLicenseOpen}
        defaultTenantId={tenant.id}
        onSuccess={() => void loadLicense()}
      />

      <LicenseExtendDialog
        open={extendLicenseOpen}
        onOpenChange={setExtendLicenseOpen}
        licenseId={tenantLicense?.id ?? null}
        onSuccess={() => void loadLicense()}
      />

      <Dialog
        open={posCredentialsOpen}
        onOpenChange={(open) => {
          setPosCredentialsOpen(open);
          if (!open) setPosCredentials([]);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>POS staff PINs</DialogTitle>
          </DialogHeader>
          <Alert>
            <AlertDescription>
              Store these securely. Share only with the tenant admin.
            </AlertDescription>
          </Alert>
          {posCredentials.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bootstrap credentials found on the POS organization.</p>
          ) : (
            <ScrollArea className="max-h-[360px] rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Role</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead>PIN</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {posCredentials.map((row) => (
                    <TableRow key={`${row.role}-${row.username}`}>
                      <TableCell className="font-medium capitalize">{row.role}</TableCell>
                      <TableCell className="font-mono text-xs">{row.username}</TableCell>
                      <TableCell className="font-mono text-sm">{row.pin}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => void copyText(`${row.role} PIN`, row.pin)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={posPinResettingRole === row.role}
                            onClick={() => void resetPosPin(row.role)}
                          >
                            {posPinResettingRole === row.role ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "Reset PIN"
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setPosCredentialsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={assignPickOpen}
        onOpenChange={(open) => {
          setAssignPickOpen(open);
          if (!open) setSelectedUnassignedId("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign existing license</DialogTitle>
          </DialogHeader>
          {unassignedPickLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : unassignedList.length === 0 ? (
            <Alert>
              <AlertDescription>There are no unassigned licenses. Generate one first.</AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-2">
              <Label>Unassigned license</Label>
              <Select
                value={selectedUnassignedId}
                onValueChange={(v) => setSelectedUnassignedId(v ?? "")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a license" />
                </SelectTrigger>
                <SelectContent>
                  {unassignedList.map((lic) => (
                    <SelectItem key={lic.id} value={lic.id}>
                      <span className="font-mono text-xs">{lic.licenseKey}</span>{" "}
                      <span className="text-muted-foreground">({lic.planSlug})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAssignPickOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!selectedUnassignedId || unassignedList.length === 0}
              onClick={() => {
                const lic = unassignedList.find((l) => l.id === selectedUnassignedId);
                if (!lic) return;
                setLicenseForAssign(lic);
                setAssignPickOpen(false);
                setAssignLicenseOpen(true);
              }}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {licenseForAssign ? (
        <LicenseAssignDialog
          open={assignLicenseOpen}
          onOpenChange={(open) => {
            setAssignLicenseOpen(open);
            if (!open) setLicenseForAssign(null);
          }}
          license={licenseForAssign}
          defaultTenantId={tenant.id}
          defaultTenantLabel={`${tenant.name} (${tenant.slug})`}
          onSuccess={() => {
            void loadLicense();
            setLicenseForAssign(null);
            setAssignLicenseOpen(false);
          }}
        />
      ) : null}

      <Dialog
        open={addModuleOpen}
        onOpenChange={(open) => {
          setAddModuleOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add module</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Provisions the selected module stack for this tenant. Existing modules are unchanged.
          </p>
          <div className="space-y-2">
            <Label>Module</Label>
            <Select
              value={addModuleChoice}
              onValueChange={(v) => setAddModuleChoice(v as "pos" | "pms" | "chat")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select module" />
              </SelectTrigger>
              <SelectContent>
                {addableModules.map((mod) => (
                  <SelectItem key={mod} value={mod}>
                    {moduleLabel(mod)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddModuleOpen(false)}>
              Cancel
            </Button>
            <Button disabled={addingModule || addableModules.length === 0} onClick={() => void addModule()}>
              {addingModule ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Add & provision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={removeModuleOpen}
        onOpenChange={(open) => {
          setRemoveModuleOpen(open);
          if (!open) setModuleToRemove(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove module</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Removes{" "}
            <span className="font-medium text-foreground">
              {moduleToRemove ? moduleLabel(moduleToRemove) : "this module"}
            </span>{" "}
            from the license and stops its Docker stack. Data volumes are not destroyed — stacks can be
            re-provisioned later by adding the module again.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRemoveModuleOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={removingModule || !moduleToRemove}
              onClick={() => void removeModule()}
            >
              {removingModule ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Remove module
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={stopProvisionOpen}
        onOpenChange={(open) => {
          setStopProvisionOpen(open);
          if (!open) setStopProvisionSlugInput("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stop provisioning</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This cancels the active provisioning lifecycle job for{" "}
            <span className="font-mono font-medium text-foreground">{tenant.slug}</span>. Type the tenant slug to
            confirm.
          </p>
          <Input
            placeholder="Tenant slug"
            value={stopProvisionSlugInput}
            onChange={(e) => setStopProvisionSlugInput(e.target.value)}
            autoComplete="off"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setStopProvisionOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={stopProvisionSlugInput !== tenant.slug || stoppingProvision}
              onClick={async () => {
                if (stopProvisionSlugInput !== tenant.slug) return;
                setStoppingProvision(true);
                setError(null);
                try {
                  const res = await fetch(`/api/tenants/${tenant.id}/provision-stop`, {
                    method: "POST",
                  });
                  const data = (await readJson(res)) as {
                    error?: string;
                    status?: string;
                  };
                  if (!res.ok) {
                    setError(formatApiError(data, data.error ?? `Stop provisioning failed (${res.status})`));
                    return;
                  }
                  await loadTenant();
                  await loadEvents();
                  toast.success(`Provision stop requested (${data.status ?? "ok"}).`);
                  setStopProvisionOpen(false);
                  setStopProvisionSlugInput("");
                } finally {
                  setStoppingProvision(false);
                }
              }}
            >
              {stoppingProvision ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Stop provisioning
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={revokeLicenseOpen} onOpenChange={setRevokeLicenseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke license</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Reason (optional)"
            value={revokeLicenseReason}
            onChange={(e) => setRevokeLicenseReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRevokeLicenseOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!tenantLicense}
              onClick={async () => {
                if (!tenantLicense) return;
                const res = await fetch(`/api/licenses/${tenantLicense.id}/revoke`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ reason: revokeLicenseReason || undefined }),
                });
                if (!res.ok) {
                  const data = (await readJson(res)) as { error?: string };
                  toast.error(formatApiError(data, "Revoke failed"));
                  return;
                }
                toast.success("License revoked");
                setRevokeLicenseOpen(false);
                setRevokeLicenseReason("");
                void loadLicense();
              }}
            >
              Revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Provisioning History</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => void loadEvents()}>
            {shouldPollProvisioning
              ? "Live (auto-refreshing)"
              : provisionPollTimedOut && isProvisioning
                ? "Refresh (auto-refresh paused)"
                : "Refresh"}
          </Button>
        </CardHeader>
        <CardContent>
          {eventsLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : events.length === 0 ? (
            <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 px-4 py-10 text-center">
              <p className="text-sm font-medium text-foreground">No provisioning events yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                When this tenant is provisioned or retried, lifecycle steps will appear here.
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-2 text-sm">
                {events.map((e) => (
                  <div key={e.id} className="rounded border p-2">
                    <p className="font-mono text-xs text-muted-foreground">{formatTime(e.createdAt)}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{e.phase}</Badge>
                      <span
                        className={
                          e.level === "error"
                            ? "text-destructive"
                            : e.level === "warn"
                              ? "text-amber-600"
                              : ""
                        }
                      >
                        {e.message}
                        {e.parentTenantId ? (
                          <span className="ml-2 text-xs text-muted-foreground">
                            (sub-org: {e.slug ?? "unknown"})
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Danger Zone</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setDangerOpen((v) => !v)}>
            {dangerOpen ? "Hide" : "Show"}
          </Button>
        </CardHeader>
        {dangerOpen ? (
          <CardContent className="space-y-4">
            {tenant.status === "active" || tenant.status === "partial" ? (
              <Button variant="outline" onClick={() => setSuspendOpen(true)}>
                <PauseCircle className="mr-1 h-4 w-4" />
                Suspend tenant
              </Button>
            ) : null}
            {tenant.status === "suspended" ? (
              <Button onClick={() => setReactivateDialogOpen(true)}>
                <PlayCircle className="mr-1 h-4 w-4" />
                Reactivate tenant
              </Button>
            ) : null}
            {isProvisioning ? (
              <Button
                variant="outline"
                disabled={stoppingProvision}
                onClick={() => {
                  setStopProvisionSlugInput("");
                  setStopProvisionOpen(true);
                }}
              >
                {stoppingProvision ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Square className="mr-1 h-4 w-4" />
                )}
                Stop provisioning
              </Button>
            ) : null}
            <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
              <Trash2 className="mr-1 h-4 w-4" />
              Delete tenant
            </Button>
          </CardContent>
        ) : null}
      </Card>

      <Dialog
        open={reactivateDialogOpen}
        onOpenChange={setReactivateDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reactivate tenant?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will restart the Docker stack for {tenant.name} and make it accessible again.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReactivateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={reactivatingTenant}
              onClick={async () => {
                setReactivatingTenant(true);
                setError(null);
                try {
                  const res = await fetch(`/api/tenants/${tenant.id}/reactivate`, { method: "POST" });
                  if (!res.ok) {
                    const body = await readJson(res);
                    const data = body as { error?: string };
                    setError(formatApiError(body, data.error ?? `Reactivate failed (${res.status})`));
                    return;
                  }
                  toast.success("Tenant reactivated");
                  setReactivateDialogOpen(false);
                  await loadTenant();
                } finally {
                  setReactivatingTenant(false);
                }
              }}
            >
              {reactivatingTenant ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Reactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={suspendOpen}
        onOpenChange={(open) => {
          setSuspendOpen(open);
          if (!open) setSuspendConfirmSlug("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspend tenant</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Docker stacks for this tenant and its organizations will be stopped. Type the tenant slug{" "}
            <span className="font-mono font-medium text-foreground">{tenant.slug}</span> to confirm.
          </p>
          <Input
            placeholder="Tenant slug"
            value={suspendConfirmSlug}
            onChange={(e) => setSuspendConfirmSlug(e.target.value)}
            autoComplete="off"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSuspendOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={suspendConfirmSlug !== tenant.slug || suspendingTenant}
              onClick={async () => {
                if (suspendConfirmSlug !== tenant.slug) return;
                setSuspendingTenant(true);
                setError(null);
                try {
                  const res = await fetch(`/api/tenants/${tenant.id}/suspend`, { method: "POST" });
                  if (!res.ok) {
                    const body = await readJson(res);
                    const data = body as { error?: string };
                    setError(formatApiError(body, data.error ?? `Suspend failed (${res.status})`));
                    return;
                  }
                  toast.success("Suspend requested");
                  setSuspendOpen(false);
                  setSuspendConfirmSlug("");
                  router.push("/tenants");
                } finally {
                  setSuspendingTenant(false);
                }
              }}
            >
              {suspendingTenant ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Suspend
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Are you absolutely sure?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete {tenant.name} and all its data. Type the tenant slug to confirm.
          </p>
          <Input value={confirmSlug} onChange={(e) => setConfirmSlug(e.target.value)} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={confirmSlug !== tenant.slug}
              onClick={() => {
                setConfirmOpen(false);
                setVolumesOpen(true);
              }}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={volumesOpen} onOpenChange={setVolumesOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Also delete Docker volumes?</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={async () => {
                const res = await fetch(`/api/tenants/${tenant.id}`, { method: "DELETE" });
                const body = await readJson(res);
                const data = body as { error?: string; message?: string; hardDeleted?: boolean };
                if (!res.ok && res.status !== 404) {
                  setError(formatApiError(body, data.message ?? data.error ?? `Delete failed (${res.status})`));
                  return;
                }
                toast.success(
                  data.hardDeleted
                    ? `Tenant "${tenant.slug}" deleted.`
                    : `Tenant "${tenant.slug}" removal started. Docker cleanup may take up to a minute.`,
                );
                router.push("/tenants");
              }}
            >
              Keep volumes
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                const res = await fetch(`/api/tenants/${tenant.id}?volumes=true`, { method: "DELETE" });
                const body = await readJson(res);
                const data = body as { error?: string; message?: string; hardDeleted?: boolean };
                if (!res.ok && res.status !== 404) {
                  setError(formatApiError(body, data.message ?? data.error ?? `Delete failed (${res.status})`));
                  return;
                }
                toast.success(
                  data.hardDeleted
                    ? `Tenant "${tenant.slug}" deleted.`
                    : `Tenant "${tenant.slug}" removal started. Docker cleanup may take up to a minute.`,
                );
                router.push("/tenants");
              }}
            >
              Delete volumes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
