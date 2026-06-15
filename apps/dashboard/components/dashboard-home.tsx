"use client";

import Link from "next/link";
import { format } from "date-fns";
import {
  Building2,
  CheckCircle2,
  Info,
  KeyRound,
  Layers,
  Plus,
  Settings2,
  Users,
} from "lucide-react";

import { useDashboardStats } from "@/hooks/use-dashboard-stats";
import { useMe } from "@/hooks/use-me";
import { useHasPermission } from "@/hooks/use-permissions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function KpiCard(props: {
  title: string;
  subtitle: string;
  value: number;
  valueClassName?: string;
  href?: string;
  loading: boolean;
}) {
  const { title, subtitle, value, valueClassName, href, loading } = props;
  const card = (
    <Card
      className={cn(
        "h-full",
        href ? "transition-colors hover:bg-muted/30" : undefined,
      )}
    >
      <CardHeader className="pb-2">
        <p className="text-sm text-muted-foreground">{title}</p>
      </CardHeader>
      <CardContent className="space-y-1 pt-0">
        {loading ? (
          <Skeleton className="h-9 w-16" />
        ) : (
          <p className={cn("text-3xl font-bold tabular-nums", valueClassName)}>{value}</p>
        )}
        <p className="text-xs text-muted-foreground">{subtitle}</p>
        {href ? (
          <p className="pt-1 text-xs text-muted-foreground/80">View details →</p>
        ) : null}
      </CardContent>
    </Card>
  );
  if (!href) {
    return <div className="block min-h-0 rounded-xl">{card}</div>;
  }
  return (
    <Link
      href={href}
      className="block min-h-0 rounded-xl outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
    >
      {card}
    </Link>
  );
}

function KpiSkeletonGrid() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <Card key={i} className="overflow-hidden">
          <CardHeader className="pb-2">
            <Skeleton className="h-4 w-24" />
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            <Skeleton className="h-9 w-14" />
            <Skeleton className="h-3 w-32" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function DashboardHome() {
  const { me } = useMe();
  const canReadTenants = useHasPermission("tenants.read");
  const canReadLicenses = useHasPermission("licenses.read");
  const { tenants, licenses, isLoading, error, refetch } = useDashboardStats();

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const ownerName = me?.name?.trim() ? me.name : "there";
  const todayLine = format(new Date(), "EEEE, MMMM d, yyyy");

  const canProvision = Boolean(me?.capabilities.canManageTenants);
  const canGenerate = me?.role === "super_admin";
  const canOwners = Boolean(me?.capabilities.canManageOwners);
  const canSettings = Boolean(me?.capabilities.canAccessSettings);

  const hasIssues =
    tenants.failed > 0 || licenses.expiringIn30Days > 0 || tenants.provisioning > 0;

  return (
    <div className="w-full space-y-8">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">
          {greeting}, {ownerName}
        </h1>
        <p className="text-sm text-muted-foreground">
          {todayLine} — Stockix Control Plane
        </p>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load dashboard stats</AlertTitle>
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>{error}</span>
            <Button type="button" size="sm" variant="outline" onClick={() => void refetch({ silent: false })}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {isLoading ? (
        <KpiSkeletonGrid />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              title="Total tenants"
              subtitle="All customer organizations"
              value={tenants.total}
              href={canReadTenants ? "/tenants" : undefined}
              loading={false}
            />
            <KpiCard
              title="Active tenants"
              subtitle="Stacks running and reachable"
              value={tenants.active}
              valueClassName="text-emerald-600 dark:text-emerald-400"
              href={canReadTenants ? "/tenants?status=active" : undefined}
              loading={false}
            />
            <KpiCard
              title="Suspended tenants"
              subtitle="Stacks stopped"
              value={tenants.suspended}
              valueClassName="text-yellow-600 dark:text-yellow-400"
              href={canReadTenants ? "/tenants?status=suspended" : undefined}
              loading={false}
            />
            <KpiCard
              title="Failed tenants"
              subtitle="Provisioning or runtime failures"
              value={tenants.failed}
              valueClassName={tenants.failed > 0 ? "text-destructive" : undefined}
              href={canReadTenants ? "/tenants?status=failed" : undefined}
              loading={false}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              title="Total licenses"
              subtitle="All license rows"
              value={licenses.total}
              href={canReadLicenses ? "/licenses" : undefined}
              loading={false}
            />
            <KpiCard
              title="Active licenses"
              subtitle="Assigned and in good standing"
              value={licenses.active}
              valueClassName="text-emerald-600 dark:text-emerald-400"
              href={canReadLicenses ? "/licenses?status=active" : undefined}
              loading={false}
            />
            <KpiCard
              title="Unassigned licenses"
              subtitle="Ready to assign to a tenant"
              value={licenses.unassigned}
              href={canReadLicenses ? "/licenses?status=unassigned" : undefined}
              loading={false}
            />
            <KpiCard
              title="Expiring (30 days)"
              subtitle="Active licenses with expiry soon"
              value={licenses.expiringIn30Days}
              valueClassName={
                licenses.expiringIn30Days > 0 ? "text-amber-600 dark:text-amber-400" : undefined
              }
              href={canReadLicenses ? "/licenses?expiring=true" : undefined}
              loading={false}
            />
          </div>
        </>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {canProvision ? (
              <Button variant="outline" className="justify-start" nativeButton={false} render={<Link href="/tenants?provision=1" />}>
                <Plus className="mr-2 h-4 w-4" />
                Provision tenant
              </Button>
            ) : (
              <Button variant="outline" className="justify-start" disabled>
                <Plus className="mr-2 h-4 w-4" />
                Provision tenant
              </Button>
            )}
            {canGenerate ? (
              <Button variant="outline" className="justify-start" nativeButton={false} render={<Link href="/licenses?generate=1" />}>
                <KeyRound className="mr-2 h-4 w-4" />
                Generate license
              </Button>
            ) : (
              <Button variant="outline" className="justify-start" disabled>
                <KeyRound className="mr-2 h-4 w-4" />
                Generate license
              </Button>
            )}
            <Button variant="outline" className="justify-start" nativeButton={false} render={<Link href="/tenants" />}>
              <Building2 className="mr-2 h-4 w-4" />
              View tenants
            </Button>
            <Button variant="outline" className="justify-start" nativeButton={false} render={<Link href="/licenses" />}>
              <Layers className="mr-2 h-4 w-4" />
              View licenses
            </Button>
            {canOwners ? (
              <Button variant="outline" className="justify-start" nativeButton={false} render={<Link href="/owners" />}>
                <Users className="mr-2 h-4 w-4" />
                Manage team
              </Button>
            ) : (
              <Button variant="outline" className="justify-start" disabled>
                <Users className="mr-2 h-4 w-4" />
                Manage team
              </Button>
            )}
            {canSettings ? (
              <Button variant="outline" className="justify-start" nativeButton={false} render={<Link href="/settings" />}>
                <Settings2 className="mr-2 h-4 w-4" />
                Settings
              </Button>
            ) : (
              <Button variant="outline" className="justify-start" disabled>
                <Settings2 className="mr-2 h-4 w-4" />
                Settings
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Alerts &amp; attention</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full rounded-lg" />
                <Skeleton className="h-16 w-full rounded-lg" />
              </div>
            ) : !hasIssues ? (
              <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-950 dark:text-emerald-100">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="font-medium">No issues detected</p>
              </div>
            ) : (
              <>
                {tenants.failed > 0 ? (
                  <Alert variant="destructive">
                    <AlertTitle>Provisioning failures</AlertTitle>
                    <AlertDescription>
                      <Link href="/tenants?status=failed" className="font-medium underline underline-offset-2">
                        {tenants.failed} tenant{tenants.failed === 1 ? "" : "s"} failed provisioning
                      </Link>
                      .
                    </AlertDescription>
                  </Alert>
                ) : null}
                {licenses.expiringIn30Days > 0 ? (
                  <Alert>
                    <AlertTitle>License expiry</AlertTitle>
                    <AlertDescription>
                      <Link href="/licenses?expiring=true" className="font-medium underline underline-offset-2">
                        {licenses.expiringIn30Days} license{licenses.expiringIn30Days === 1 ? "" : "s"} expiring within 30
                        days
                      </Link>
                      .
                    </AlertDescription>
                  </Alert>
                ) : null}
                {tenants.provisioning > 0 ? (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertTitle>In progress</AlertTitle>
                    <AlertDescription>
                      <Link href="/tenants?status=provisioning" className="font-medium underline underline-offset-2">
                        {tenants.provisioning} tenant{tenants.provisioning === 1 ? "" : "s"} currently provisioning
                      </Link>
                      .
                    </AlertDescription>
                  </Alert>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
