"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { Copy, ExternalLink, History, Loader2, PauseCircle, PlayCircle, RotateCw, Square, Trash2, UserCheck } from "lucide-react";
import { toast } from "@/components/reusabletoast";

import { LicenseAssignDialog } from "@/components/license-assign-dialog";
import LicenseGenerateDialog from "@/components/license-generate-dialog";
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
import type { LicenseRow, LicenseStatus } from "@/types/license";
import type { ProvisionEventRow, TenantDetail } from "@/types/tenant";
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
  const [assignPickOpen, setAssignPickOpen] = useState(false);
  const [unassignedPickLoading, setUnassignedPickLoading] = useState(false);
  const [unassignedList, setUnassignedList] = useState<LicenseRow[]>([]);
  const [selectedUnassignedId, setSelectedUnassignedId] = useState("");
  const [licenseForAssign, setLicenseForAssign] = useState<LicenseRow | null>(null);
  const [assignLicenseOpen, setAssignLicenseOpen] = useState(false);
  const [licenseHistory, setLicenseHistory] = useState<LicenseRow[]>([]);
  const [licenseHistoryLoading, setLicenseHistoryLoading] = useState(false);
  const [licenseHistoryOpen, setLicenseHistoryOpen] = useState(false);
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
  const isProvisioning =
    deploymentStatus === "provisioning" || deploymentStatus === "pending";

  useEffect(() => {
    if (!tenant || !isProvisioning) return;
    const intervalId = window.setInterval(() => {
      void loadTenant();
      void loadEvents();
    }, 2500);
    return () => window.clearInterval(intervalId);
  }, [tenant, isProvisioning]);

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
                  <TenantStatusBadge status={tenant.deployment?.status ?? tenant.status} />
                </div>
                <div className="grid gap-2 text-sm md:grid-cols-2">
                  <p>Admin email: {tenant.adminEmail}</p>
                  <p>Admin first name: {tenant.adminFirstName}</p>
                  <p>Admin last name: {tenant.adminLastName}</p>
                  <p>Owner ID: <span className="font-mono">{tenant.ownerId}</span></p>
                  <p>Plan: <span className="capitalize">{tenant.planSlug}</span></p>
                  <p>Created: {formatDateTime(tenant.createdAt)}</p>
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
              {tenant.deployment?.status === "active" && baseUrl ? (
                <>
                  <a
                    href={`${baseUrl}/auth/login`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonVariants({ size: "sm" })}
                  >
                    <ExternalLink className="mr-1 h-4 w-4" />
                    Open login
                  </a>
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
            <TenantStatusBadge status={tenant.deployment?.status ?? tenant.status} />
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
          financeLinked={
            !isProvisioning &&
            (tenant.deployment?.status ?? "").toLowerCase() === "active" &&
            tenant.deployment != null &&
            Number(tenant.deployment.internalPort) > 0
          }
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
                      <Badge variant="secondary">Perpetual</Badge>
                    ) : tenantLicense.expiresAt ? (
                      format(new Date(tenantLicense.expiresAt), "PP")
                    ) : (
                      "—"
                    )}
                  </p>
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
                  <Button variant="outline" size="sm" onClick={() => setRevokeLicenseOpen(true)}>
                    Revoke
                  </Button>
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
            {isProvisioning ? "Live (auto-refreshing)" : "Refresh"}
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
            {tenant.status === "active" ? (
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
                const data = body as { error?: string; message?: string };
                if (!res.ok && res.status !== 404) {
                  setError(formatApiError(body, data.message ?? data.error ?? `Delete failed (${res.status})`));
                  return;
                }
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
                const data = body as { error?: string; message?: string };
                if (!res.ok && res.status !== 404) {
                  setError(formatApiError(body, data.message ?? data.error ?? `Delete failed (${res.status})`));
                  return;
                }
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
