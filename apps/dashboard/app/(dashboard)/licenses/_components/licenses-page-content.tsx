"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Plus } from "lucide-react";
import { toast } from "@/components/reusabletoast";

import { LicenseAssignDialog } from "@/components/license-assign-dialog";
import LicenseGenerateDialog from "@/components/license-generate-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { LicenseAnalytics, LicenseRow } from "@/types/license";
import { useMe } from "@/hooks/use-me";

import { LicenseBulkActions } from "./license-bulk-actions";
import { LicenseFilters } from "./license-filters";
import { LicenseTable } from "./license-table";

export function LicensesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { me } = useMe();
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
  const [planOptions, setPlanOptions] = useState<Array<{ slug: string; name: string }>>([]);
  const [expiring30, setExpiring30] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [assignLicense, setAssignLicense] = useState<LicenseRow | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<LicenseRow | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [revoking, setRevoking] = useState(false);
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
    void (async () => {
      const res = await fetch("/api/plans");
      const data = (await res.json().catch(() => ({}))) as {
        plans?: Array<{ slug: string; name: string; isActive?: boolean }>;
      };
      if (res.ok && data.plans?.length) {
        setPlanOptions(
          data.plans
            .filter((p) => p.isActive !== false)
            .map((p) => ({ slug: p.slug, name: p.name })),
        );
      }
    })();
  }, []);

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

  const handleExport = () => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (productFilter !== "all") params.set("product", productFilter);
    if (planFilter !== "all") params.set("planSlug", planFilter);
    if (expiring30) params.set("expiringInDays", "30");
    const query = params.toString();
    window.location.href = `/api/licenses/export.csv${query ? `?${query}` : ""}`;
  };

  const refreshAfterMutation = () => {
    void loadAnalytics();
    void loadList();
  };

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

        <LicenseFilters
          searchInput={searchInput}
          onSearchInputChange={(value) => {
            setSearchInput(value);
            setPage(1);
          }}
          statusFilter={statusFilter}
          onStatusFilterChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
          productFilter={productFilter}
          onProductFilterChange={(v) => {
            setProductFilter(v);
            setPage(1);
          }}
          planFilter={planFilter}
          onPlanFilterChange={(v) => {
            setPlanFilter(v);
            setPage(1);
          }}
          planOptions={planOptions}
          expiring30={expiring30}
          onExpiring30Toggle={() => {
            setExpiring30((v) => !v);
            setPage(1);
          }}
          anyFilter={anyFilter}
          onClearFilters={clearFilters}
          onExport={handleExport}
        />

        <LicenseTable
          listLoading={listLoading}
          licenses={licenses}
          anyFilter={anyFilter}
          onClearFilters={clearFilters}
          canGenerateLicenses={!!canGenerateLicenses}
          onOpenGenerate={() => setGenOpen(true)}
          copied={copied}
          onCopyKey={copyKey}
          onAssignLicense={setAssignLicense}
          onRevokeLicense={(row) => {
            setRevokeReason("");
            setRevokeTarget(row);
          }}
          from={from}
          to={to}
          total={total}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      </div>

      {canGenerateLicenses ? (
        <LicenseGenerateDialog
          open={genOpen}
          onOpenChange={setGenOpen}
          onSuccess={refreshAfterMutation}
        />
      ) : null}
      {assignLicense ? (
        <LicenseAssignDialog
          open
          onOpenChange={(o) => !o && setAssignLicense(null)}
          license={assignLicense}
          onSuccess={() => {
            setAssignLicense(null);
            refreshAfterMutation();
          }}
        />
      ) : null}

      <LicenseBulkActions
        revokeTarget={revokeTarget}
        onRevokeOpenChange={(o) => {
          if (!o) {
            setRevokeTarget(null);
            setRevokeReason("");
            setRevoking(false);
          }
        }}
        revokeReason={revokeReason}
        onRevokeReasonChange={setRevokeReason}
        revoking={revoking}
        onRevokingChange={setRevoking}
        onRevokeSuccess={() => {
          setRevokeTarget(null);
          setRevokeReason("");
          refreshAfterMutation();
        }}
      />
    </TooltipProvider>
  );
}
