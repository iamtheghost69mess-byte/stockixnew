"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Copy,
  MoreHorizontal,
  Plus,
  Search,
} from "lucide-react";
import { toast } from "@/components/reusabletoast";

import LicenseAssignDialog from "@/components/license-assign-dialog";
import LicenseGenerateDialog from "@/components/license-generate-dialog";
import LicenseStatusBadge from "@/components/license-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { LicenseAnalytics, LicenseRow, LicenseStatus } from "@/types/license";
import { format } from "date-fns";
import { useMe } from "@/hooks/use-me";

function productLabel(p: string): string {
  if (p === "pos_desktop") return "POS Desktop";
  if (p === "bundle") return "Bundle";
  return "Platform";
}

export default function LicensesPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6 p-6 text-sm text-muted-foreground">Loading licenses…</div>
      }
    >
      <LicensesPageContent />
    </Suspense>
  );
}

function LicensesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const me = useMe();
  const canGenerateLicenses = me?.role === "super_admin";
  const [analytics, setAnalytics] = useState<LicenseAnalytics | null>(null);
  const [licenses, setLicenses] = useState<LicenseRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [productFilter, setProductFilter] = useState<string>("all");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [expiring30, setExpiring30] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [assignLicense, setAssignLicense] = useState<LicenseRow | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("expiring") === "true") {
      setExpiring30(true);
    }
    const st = searchParams.get("status");
    if (st === "active" || st === "unassigned" || st === "revoked" || st === "expired") {
      setStatusFilter(st);
    }
  }, [searchParams]);

  useEffect(() => {
    if (searchParams.get("generate") !== "1") return;
    if (me?.role !== "super_admin") return;
    setGenOpen(true);
    router.replace("/licenses", { scroll: false });
  }, [searchParams, router, me?.role]);

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    p.set("page", String(page));
    p.set("pageSize", String(pageSize));
    if (search.trim()) p.set("search", search.trim());
    if (statusFilter !== "all") p.set("status", statusFilter);
    if (productFilter !== "all") p.set("product", productFilter);
    if (planFilter !== "all") p.set("planSlug", planFilter);
    if (expiring30) p.set("expiringInDays", "30");
    return p.toString();
  }, [page, pageSize, search, statusFilter, productFilter, planFilter, expiring30]);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/licenses/analytics");
      const data = (await res.json().catch(() => ({}))) as LicenseAnalytics | { error?: string };
      if (res.ok && "total" in data) setAnalytics(data);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadList = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await fetch(`/api/licenses?${queryString}`);
      const data = (await res.json().catch(() => ({}))) as {
        licenses?: LicenseRow[];
        total?: number;
      };
      if (res.ok) {
        setLicenses(data.licenses ?? []);
        setTotal(data.total ?? 0);
      }
    } finally {
      setListLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const anyFilter =
    statusFilter !== "all"
    || productFilter !== "all"
    || planFilter !== "all"
    || expiring30
    || search.trim().length > 0;

  const clearFilters = () => {
    setStatusFilter("all");
    setProductFilter("all");
    setPlanFilter("all");
    setExpiring30(false);
    setSearchInput("");
    setSearch("");
    setPage(1);
  };

  const copyKey = async (key: string) => {
    await navigator.clipboard.writeText(key);
    setCopied(key);
    toast.success("Copied");
    window.setTimeout(() => setCopied(null), 1500);
  };

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Licenses</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage software licenses for tenants and POS terminals
            </p>
          </div>
          {canGenerateLicenses ? (
            <Button onClick={() => setGenOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Generate license
            </Button>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {loading || !analytics ? (
            <>
              {[1, 2, 3, 4].map((i) => (
                <Card key={i}>
                  <CardHeader className="pb-2">
                    <Skeleton className="h-4 w-24" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-8 w-16" />
                  </CardContent>
                </Card>
              ))}
            </>
          ) : (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total licenses
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-semibold tabular-nums text-muted-foreground">
                  {analytics.total}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                    Active
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {analytics.active}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
                    Expiring in 30 days
                    {analytics.expiringIn30Days > 0 ? (
                      <AlertTriangle className="h-4 w-4" />
                    ) : null}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                  {analytics.expiringIn30Days}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Unassigned
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-semibold tabular-nums text-muted-foreground">
                  {analytics.unassigned}
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search key or tenant…"
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v ?? "all");
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              <SelectItem value="revoked">Revoked</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={productFilter}
            onValueChange={(v) => {
              setProductFilter(v ?? "all");
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Product" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All products</SelectItem>
              <SelectItem value="platform">Platform</SelectItem>
              <SelectItem value="pos_desktop">POS Desktop</SelectItem>
              <SelectItem value="bundle">Bundle</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={planFilter}
            onValueChange={(v) => {
              setPlanFilter(v ?? "all");
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Plan" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All plans</SelectItem>
              <SelectItem value="starter">Starter</SelectItem>
              <SelectItem value="growth">Growth</SelectItem>
              <SelectItem value="pro">Pro</SelectItem>
              <SelectItem value="enterprise">Enterprise</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant={expiring30 ? "default" : "outline"}
            className={expiring30 ? "bg-amber-600 hover:bg-amber-600" : ""}
            onClick={() => {
              setExpiring30((v) => !v);
              setPage(1);
            }}
          >
            Expiring in 30 days
          </Button>
          {anyFilter ? (
            <Button type="button" variant="ghost" onClick={clearFilters}>
              Clear filters
            </Button>
          ) : null}
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>License key</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Activations</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="w-[70px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {listLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : licenses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center">
                    <div className="flex flex-col items-center gap-3 py-6">
                      <p className="text-muted-foreground">
                        {anyFilter ? "No results match your filters" : "No licenses found"}
                      </p>
                      {anyFilter ? (
                        <Button variant="outline" onClick={clearFilters}>
                          Clear filters
                        </Button>
                      ) : canGenerateLicenses ? (
                        <Button onClick={() => setGenOpen(true)}>Generate your first license</Button>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Ask a super admin to generate the first license.
                        </p>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                licenses.map((row) => (
                  <TableRow key={row.id} className="group">
                    <TableCell>
                      <div className="flex items-center gap-1 font-mono text-xs">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-auto max-w-[140px] truncate p-0 text-left font-mono text-xs hover:bg-transparent hover:underline sm:max-w-[180px]"
                          title="Click to copy"
                          onClick={() => void copyKey(row.licenseKey)}
                        >
                          {row.licenseKey}
                        </Button>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0 opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-100"
                                onClick={() => void copyKey(row.licenseKey)}
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                            }
                          />
                          <TooltipContent>{copied === row.licenseKey ? "Copied!" : "Copy"}</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{productLabel(row.product)}</Badge>
                    </TableCell>
                    <TableCell className="capitalize">{row.planSlug}</TableCell>
                    <TableCell>
                      {row.tenantId ? (
                        <Link
                          href={`/tenants/${row.tenantId}`}
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          {row.tenantName ?? row.tenantSlug}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <LicenseStatusBadge status={row.status as LicenseStatus} />
                    </TableCell>
                    <TableCell>
                      {row.product === "platform" ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className="tabular-nums text-sm">
                          {row.activationCount} / {row.maxActivations}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.isPerpetual ? (
                        <Badge variant="secondary">Perpetual</Badge>
                      ) : row.expiresAt ? (
                        format(new Date(row.expiresAt), "PP")
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => router.push(`/licenses/${row.id}`)}>
                            View details
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {canGenerateLicenses && row.status === "unassigned" ? (
                            <DropdownMenuItem onClick={() => setAssignLicense(row)}>
                              Assign to tenant
                            </DropdownMenuItem>
                          ) : null}
                          {canGenerateLicenses && row.status === "active" ? (
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => router.push(`/licenses/${row.id}`)}
                            >
                              Revoke…
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {from}–{to} of {total} licenses
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page * pageSize >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {canGenerateLicenses ? (
        <LicenseGenerateDialog
          open={genOpen}
          onOpenChange={setGenOpen}
          onSuccess={() => {
            void loadAnalytics();
            void loadList();
          }}
        />
      ) : null}
      {assignLicense ? (
        <LicenseAssignDialog
          open
          onOpenChange={(o) => !o && setAssignLicense(null)}
          license={assignLicense}
          onSuccess={() => {
            setAssignLicense(null);
            void loadAnalytics();
            void loadList();
          }}
        />
      ) : null}
    </TooltipProvider>
  );
}
