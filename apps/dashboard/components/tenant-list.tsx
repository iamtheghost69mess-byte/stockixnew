"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Copy,
  ExternalLink,
  Loader2,
  PauseCircle,
  PlayCircle,
  Square,
  Search,
  Trash2,
} from "lucide-react";

import TenantStatusBadge from "@/components/tenant-status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { tenantPublicBaseUrl } from "@/lib/tenant-url";
import type { TenantRow } from "@/types/tenant";

type StatusFilter = "all" | "active" | "suspended" | "provisioning" | "failed";
type SortOrder = "newest" | "oldest" | "name_asc" | "name_desc";

type Props = {
  tenants: TenantRow[];
  onDelete: (tenantId: string, slug: string) => Promise<void>;
  onSuspend: (tenantId: string, slug: string) => Promise<void>;
  onReactivate: (tenantId: string, slug: string) => Promise<void>;
  onStopProvision: (tenantId: string, slug: string) => Promise<void>;
  deletingId: string | null;
  suspendingId: string | null;
  reactivatingId: string | null;
  stoppingId: string | null;
};

export default function TenantList(props: Props) {
  const {
    tenants,
    onDelete,
    onSuspend,
    onReactivate,
    onStopProvision,
    deletingId,
    suspendingId,
    reactivatingId,
    stoppingId,
  } = props;
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query.trim()), 150);
    return () => window.clearTimeout(id);
  }, [query]);

  const counts = useMemo(() => {
    const active = tenants.filter((t) => t.deploymentStatus === "active").length;
    const suspended = tenants.filter(
      (t) => t.deploymentStatus === "suspended",
    ).length;
    return { total: tenants.length, active, suspended };
  }, [tenants]);

  const filtered = useMemo(() => {
    const q = debouncedQuery.toLowerCase();
    let rows = tenants.filter((t) => {
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.slug.toLowerCase().includes(q) ||
        t.adminEmail.toLowerCase().includes(q)
      );
    });

    if (statusFilter !== "all") {
      rows = rows.filter((t) => (t.deploymentStatus ?? "unknown") === statusFilter);
    }

    const out = [...rows];
    out.sort((a, b) => {
      if (sortOrder === "name_asc") return a.name.localeCompare(b.name);
      if (sortOrder === "name_desc") return b.name.localeCompare(a.name);
      const aTime = a.registrationCompletedAt
        ? Date.parse(a.registrationCompletedAt)
        : 0;
      const bTime = b.registrationCompletedAt
        ? Date.parse(b.registrationCompletedAt)
        : 0;
      if (sortOrder === "oldest") return aTime - bTime;
      return bTime - aTime;
    });
    return out;
  }, [debouncedQuery, sortOrder, statusFilter, tenants]);

  const clearFilters = () => {
    setQuery("");
    setDebouncedQuery("");
    setStatusFilter("all");
  };

  const copyText = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 2000);
  };

  if (tenants.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-14 text-center">
          <Building2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <h3 className="text-base font-semibold">No tenants yet</h3>
          <p className="text-sm text-muted-foreground">
            Provision your first tenant above.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {counts.total} tenants · {counts.active} active · {counts.suspended}{" "}
        suspended
      </p>

      <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, slug, or admin email"
            className="pl-9"
          />
        </div>
        <Select
          value={sortOrder}
          onValueChange={(v) => setSortOrder(v as SortOrder)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="name_asc">Name A→Z</SelectItem>
            <SelectItem value="name_desc">Name Z→A</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "active", "suspended", "provisioning", "failed"] as const).map(
          (status) => (
            <Badge
              key={status}
              variant={statusFilter === status ? "default" : "outline"}
              className="cursor-pointer capitalize"
              onClick={() => setStatusFilter(status)}
            >
              {status}
            </Badge>
          ),
        )}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-muted-foreground">
              No tenants match your search.
            </p>
            <Button variant="ghost" size="sm" className="mt-2" onClick={clearFilters}>
              Clear filters
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3">
        {filtered.map((t) => {
          const status = t.deploymentStatus ?? "unknown";
          const canOpen = status === "active";
          const publicOrigin = tenantPublicBaseUrl(t.slug, t.internalPort);
          const loginHref = `${publicOrigin}/auth/login`;

          return (
            <Card key={t.tenantId}>
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold">{t.name}</h3>
                      <Badge variant="outline" className="font-mono">
                        {t.slug}
                      </Badge>
                      <TenantStatusBadge status={status} />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Admin: <span className="font-mono">{t.adminEmail}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Registered:{" "}
                      {t.registrationCompletedAt
                        ? new Date(t.registrationCompletedAt).toLocaleString()
                        : "Not registered yet"}
                    </p>
                    {t.lastError ? (
                      <Alert variant="destructive" className="max-w-xl">
                        <AlertDescription>
                          {t.lastError.slice(0, 200)}
                          {t.lastError.length > 200 ? "..." : ""}
                        </AlertDescription>
                      </Alert>
                    ) : null}
                  </div>
                  <div className="flex w-full flex-col gap-2 lg:w-auto">
                    <Link
                      href={`/tenants/${t.tenantId}`}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      View details
                    </Link>
                    {canOpen ? (
                      <a
                        href={loginHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={buttonVariants({ size: "sm" })}
                      >
                        <ExternalLink className="mr-1 h-4 w-4" />
                        Open login
                      </a>
                    ) : null}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void copyText(`origin-${t.tenantId}`, publicOrigin)}
                    >
                      <Copy className="mr-1 h-4 w-4" />
                      {copiedKey === `origin-${t.tenantId}` ? "Copied" : "Copy URL"}
                    </Button>
                    {status === "active" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void onSuspend(t.tenantId, t.slug)}
                        disabled={Boolean(suspendingId)}
                      >
                        {suspendingId === t.tenantId ? (
                          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        ) : (
                          <PauseCircle className="mr-1 h-4 w-4" />
                        )}
                        Suspend
                      </Button>
                    ) : null}
                    {status === "suspended" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void onReactivate(t.tenantId, t.slug)}
                        disabled={Boolean(reactivatingId)}
                      >
                        {reactivatingId === t.tenantId ? (
                          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        ) : (
                          <PlayCircle className="mr-1 h-4 w-4" />
                        )}
                        Reactivate
                      </Button>
                    ) : null}
                    {(status === "provisioning" || status === "pending") ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void onStopProvision(t.tenantId, t.slug)}
                        disabled={Boolean(stoppingId)}
                      >
                        {stoppingId === t.tenantId ? (
                          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        ) : (
                          <Square className="mr-1 h-4 w-4" />
                        )}
                        Stop provisioning
                      </Button>
                    ) : null}
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => void onDelete(t.tenantId, t.slug)}
                      disabled={Boolean(deletingId)}
                    >
                      {deletingId === t.tenantId ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="mr-1 h-4 w-4" />
                      )}
                      Delete
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <Separator className="mb-3" />
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span className="font-mono">{publicOrigin}</span>
                  {t.internalPort != null ? (
                    <span>
                      Host port <span className="font-mono">{t.internalPort}</span>
                    </span>
                  ) : null}
                  {t.composeProject ? (
                    <span className="font-mono">compose: {t.composeProject}</span>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
