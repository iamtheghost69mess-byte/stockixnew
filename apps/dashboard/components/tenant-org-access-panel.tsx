"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Trash2, UserCog } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatApiError } from "@/lib/api-errors";
import { formatDateTime } from "@/lib/date-format";

type Grant = {
  id: string;
  ownerId: string;
  organizationId: string;
  createdAt: string;
  ownerEmail: string;
  ownerName: string;
  organizationName: string;
  organizationSlug: string;
};

type OwnerRow = { id: string; email: string; name: string; role: string; status: string };

type OrgRow = { id: string; name: string; slug: string };

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

export default function TenantOrgAccessPanel({ tenantId }: { tenantId: string }) {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [owners, setOwners] = useState<OwnerRow[]>([]);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [ownerId, setOwnerId] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [gRes, oRes, orgRes] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/organization-access`),
        fetch("/api/owners"),
        fetch(`/api/tenants/${tenantId}/organizations`),
      ]);
      const gData = (await readJson(gRes)) as { grants?: Grant[] };
      const oData = (await readJson(oRes)) as { owners?: OwnerRow[] };
      const orgData = (await readJson(orgRes)) as { organizations?: OrgRow[] };
      if (gRes.ok) setGrants(gData.grants ?? []);
      if (oRes.ok) {
        const list = (oData.owners ?? []).filter(
          (o) => o.role === "support_agent" && o.status === "active",
        );
        setOwners(list);
      }
      if (orgRes.ok) {
        const raw = orgData.organizations ?? [];
        setOrgs(raw.map((o) => ({ id: o.id, name: o.name, slug: o.slug })));
      }
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const addGrant = async () => {
    if (!ownerId || !organizationId) {
      toast.error("Select a support agent and an organization.");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/organization-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId, organizationId }),
      });
      const body = await readJson(res);
      if (!res.ok) {
        toast.error(formatApiError(body, "Could not add access grant."));
        return;
      }
      toast.success("Access grant added");
      setOwnerId("");
      setOrganizationId("");
      await load();
    } finally {
      setAdding(false);
    }
  };

  const removeGrant = async (accessId: string) => {
    setRemovingId(accessId);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/organization-access/${accessId}`, {
        method: "DELETE",
      });
      const body = await readJson(res);
      if (!res.ok) {
        toast.error(formatApiError(body, "Could not remove grant."));
        return;
      }
      toast.success("Grant removed");
      await load();
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserCog className="h-4 w-4" />
          Support agent organization access
        </CardTitle>
        <CardDescription>
          When a support agent has one or more grants on this tenant, they only see and manage those
          organizations. With no grants, they retain full access to all organizations (default).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Support agent</Label>
                <Select value={ownerId || undefined} onValueChange={(v) => setOwnerId(v ?? "")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose owner" />
                  </SelectTrigger>
                  <SelectContent>
                    {owners.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name} ({o.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Organization</Label>
                <Select
                  value={organizationId || undefined}
                  onValueChange={(v) => setOrganizationId(v ?? "")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose organization" />
                  </SelectTrigger>
                  <SelectContent>
                    {orgs.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name}{" "}
                        <span className="text-muted-foreground">({o.slug})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button type="button" onClick={() => void addGrant()} disabled={adding || !ownerId || !organizationId}>
              {adding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Add grant
            </Button>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Support agent</TableHead>
                    <TableHead>Organization</TableHead>
                    <TableHead>Since</TableHead>
                    <TableHead className="w-[100px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grants.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                        No scoped grants — all support agents see every organization on this tenant.
                      </TableCell>
                    </TableRow>
                  ) : (
                    grants.map((g) => (
                      <TableRow key={g.id}>
                        <TableCell className="text-sm">{g.ownerName}</TableCell>
                        <TableCell className="text-sm">
                          {g.organizationName}{" "}
                          <span className="text-muted-foreground">({g.organizationSlug})</span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDateTime(g.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            disabled={removingId === g.id}
                            onClick={() => void removeGrant(g.id)}
                            aria-label="Remove grant"
                          >
                            {removingId === g.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
