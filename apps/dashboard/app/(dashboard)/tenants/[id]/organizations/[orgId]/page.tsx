"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "@/components/reusabletoast";

import OrgStatusBadge from "@/components/org-status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@repo/ui/alert-dialog";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@repo/ui/breadcrumb";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/dialog";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Skeleton } from "@repo/ui/skeleton";
import { useOrganizations, type Organization } from "@/hooks/use-organizations";
import { formatApiError } from "@/lib/api-errors";
import { formatDateTime } from "@/lib/date-format";
import { validateOrganizationDisplayName } from "@/lib/validate-org-name";

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

type OrgDetailResponse = {
  organization?: Organization & { provisioningError?: string | null };
  error?: string;
};

export default function OrgDetailPage() {
  const params = useParams<{ id: string; orgId: string }>();
  const router = useRouter();
  const tenantId = params.id;
  const orgId = params.orgId;
  const { organizations, refetch } = useOrganizations(tenantId);
  const [org, setOrg] = useState<Organization | null>(null);
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [orgRes, tenantRes] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/organizations/${orgId}`),
        fetch(`/api/tenants/${tenantId}`),
      ]);
      const tenantJson = (await readJson(tenantRes)) as { tenant?: { name: string } };
      setTenantName(tenantRes.ok && tenantJson.tenant?.name ? tenantJson.tenant.name : null);
      const data = (await readJson(orgRes)) as OrgDetailResponse;
      if (!orgRes.ok || !data.organization) {
        setOrg(null);
        return;
      }
      setOrg(data.organization as Organization);
      setRenameValue(data.organization.name);
    } finally {
      setLoading(false);
    }
  }, [tenantId, orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const row = org ?? organizations.find((o) => o.id === orgId);
  const isPrimary = row?.isPrimary === true;

  const saveRename = async () => {
    const nameErr = validateOrganizationDisplayName(renameValue);
    if (nameErr) {
      toast.error(nameErr);
      return;
    }
    const name = renameValue.trim();
    setSaving(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/organizations/${orgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = await readJson(res);
      if (!res.ok) {
        toast.error(formatApiError(body, "Rename failed"));
        return;
      }
      toast.success("Organization updated");
      setRenameOpen(false);
      await load();
      void refetch(true);
    } finally {
      setSaving(false);
    }
  };

  const confirmSuspend = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/organizations/${orgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "suspended" }),
      });
      const body = await readJson(res);
      if (!res.ok) {
        toast.error(formatApiError(body, "Suspend failed"));
        return;
      }
      toast.success("Organization suspended");
      setSuspendOpen(false);
      await load();
      void refetch(true);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/organizations/${orgId}`, {
        method: "DELETE",
      });
      const body = await readJson(res);
      if (!res.ok) {
        toast.error(formatApiError(body, "Delete failed"));
        return;
      }
      toast.success("Organization deleted");
      router.push(`/tenants/${tenantId}`);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!org) {
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
              <BreadcrumbLink href={`/tenants/${tenantId}`}>
                {tenantName ?? tenantId}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{orgId}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Organization not found.
            <div className="mt-4">
              <Button variant="outline" onClick={() => router.push(`/tenants/${tenantId}`)}>
                Back to tenant
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

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
            <BreadcrumbLink href={`/tenants/${tenantId}`}>{tenantName ?? tenantId}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{org.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {org.name}
            <OrgStatusBadge status={org.status} />
            {isPrimary ? (
              <Badge variant="outline" className="text-xs font-semibold uppercase tracking-wide">
                Primary
              </Badge>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            <span className="text-muted-foreground">Slug:</span>{" "}
            <span className="font-mono">{org.slug}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Subdomain:</span> {org.subdomain}
          </p>
          {org.financeOrganizationId ? (
            <p>
              <span className="text-muted-foreground">Finance organization ID:</span>{" "}
              <span className="font-mono">{org.financeOrganizationId}</span>
            </p>
          ) : null}
          <p>
            <span className="text-muted-foreground">Created:</span> {formatDateTime(org.createdAt)}
          </p>
          {org.provisioningError ? (
            <p className="text-destructive">{org.provisioningError}</p>
          ) : null}
          {org.publicUrl ? (
            <p>
              <a className="text-primary underline" href={org.publicUrl} target="_blank" rel="noreferrer">
                Open app
              </a>
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-4">
            <Button variant="outline" size="sm" onClick={() => setRenameOpen(true)}>
              Rename
            </Button>
            {!isPrimary && org.status === "active" ? (
              <Button variant="destructive" size="sm" onClick={() => setSuspendOpen(true)}>
                Suspend
              </Button>
            ) : null}
          </div>
          {!isPrimary ? (
            <div className="border-t pt-4">
              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <Button variant="destructive" size="sm" disabled={deleting}>
                      Delete Organization
                    </Button>
                  }
                />
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {org.name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete this organization and all its data. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => void handleDelete()}
                      disabled={deleting}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename organization</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="org-rename">Name</Label>
            <Input id="org-rename" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} maxLength={100} />
            <p className="text-xs text-muted-foreground">2–100 characters.</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={saving || validateOrganizationDisplayName(renameValue) !== null}
              onClick={() => void saveRename()}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={suspendOpen} onOpenChange={setSuspendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspend organization</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            The organization stack will be stopped. This cannot be applied to the primary organization.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSuspendOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={saving} onClick={() => void confirmSuspend()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Suspend"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
