"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, PauseCircle, PlayCircle, Trash2 } from "lucide-react";

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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { tenantPublicBaseUrl } from "@/lib/tenant-url";
import type { ProvisionEventRow, TenantDetail } from "@/types/tenant";
import { buttonVariants } from "@/components/ui/button";

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [events, setEvents] = useState<ProvisionEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dangerOpen, setDangerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [volumesOpen, setVolumesOpen] = useState(false);
  const [confirmSlug, setConfirmSlug] = useState("");
  const [form, setForm] = useState({
    name: "",
    adminEmail: "",
    adminFirstName: "",
    adminLastName: "",
  });

  const loadTenant = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tenants/${id}`);
      const data = (await res.json()) as { error?: string; tenant?: TenantDetail };
      if (!res.ok || !data.tenant) throw new Error(data.error ?? `HTTP ${res.status}`);
      setTenant(data.tenant);
      setForm({
        name: data.tenant.name,
        adminEmail: data.tenant.adminEmail,
        adminFirstName: data.tenant.adminFirstName,
        adminLastName: data.tenant.adminLastName,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const loadEvents = async () => {
    setEventsLoading(true);
    try {
      const res = await fetch(`/api/tenants/${id}/events`);
      const data = (await res.json()) as { events?: ProvisionEventRow[] };
      setEvents(data.events ?? []);
    } finally {
      setEventsLoading(false);
    }
  };

  useEffect(() => {
    void loadTenant();
    void loadEvents();
  }, [id]);

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

  const saveProfile = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/tenants/${tenant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json()) as { tenant?: TenantDetail; error?: string };
      if (!res.ok || !data.tenant) throw new Error(data.error ?? `HTTP ${res.status}`);
      setTenant(data.tenant);
      setEditing(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

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
                  <p>Created: {new Date(tenant.createdAt).toLocaleString()}</p>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
                <Input value={form.adminEmail} onChange={(e) => setForm((p) => ({ ...p, adminEmail: e.target.value }))} />
                <Input value={form.adminFirstName} onChange={(e) => setForm((p) => ({ ...p, adminFirstName: e.target.value }))} />
                <Input value={form.adminLastName} onChange={(e) => setForm((p) => ({ ...p, adminLastName: e.target.value }))} />
                <div className="flex gap-2">
                  <Button onClick={() => void saveProfile()} disabled={saving}>
                    {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                    Save changes
                  </Button>
                  <Button variant="ghost" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Infrastructure</CardTitle>
            <div className="flex gap-2">
              {tenant.deployment?.status === "active" && baseUrl ? (
                <a
                  href={`${baseUrl}/auth/login`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonVariants({ size: "sm" })}
                >
                  <ExternalLink className="mr-1 h-4 w-4" />
                  Open login
                </a>
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
                ? new Date(tenant.deployment.registrationCompletedAt).toLocaleString()
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
            <p className="text-sm text-muted-foreground">No provisioning events recorded.</p>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-2 text-sm">
                {events.map((e) => (
                  <div key={e.id} className="rounded border p-2">
                    <p className="font-mono text-xs text-muted-foreground">
                      {new Date(e.createdAt).toLocaleTimeString()}
                    </p>
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
              <Button
                variant="outline"
                onClick={async () => {
                  await fetch(`/api/tenants/${tenant.id}/suspend`, { method: "POST" });
                  router.push("/tenants");
                }}
              >
                <PauseCircle className="mr-1 h-4 w-4" />
                Suspend tenant
              </Button>
            ) : null}
            {tenant.status === "suspended" ? (
              <Button
                onClick={async () => {
                  await fetch(`/api/tenants/${tenant.id}/reactivate`, { method: "POST" });
                  await loadTenant();
                }}
              >
                <PlayCircle className="mr-1 h-4 w-4" />
                Reactivate tenant
              </Button>
            ) : null}
            <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
              <Trash2 className="mr-1 h-4 w-4" />
              Delete tenant
            </Button>
          </CardContent>
        ) : null}
      </Card>

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
                await fetch(`/api/tenants/${tenant.id}`, { method: "DELETE" });
                router.push("/tenants");
              }}
            >
              Keep volumes
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                await fetch(`/api/tenants/${tenant.id}?volumes=true`, { method: "DELETE" });
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
