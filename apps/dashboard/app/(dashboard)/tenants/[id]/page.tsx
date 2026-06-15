"use client";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { OrgSwitcher } from "@/components/org-switcher";
import TenantOrgAccessPanel from "@/components/tenant-org-access-panel";
import TenantUsersPanel from "@/components/tenant-users-panel";

import { TenantBrandingPanel } from "./_components/tenant-branding-panel";
import { TenantDangerZone } from "./_components/tenant-danger-zone";
import { TenantFinanceCredentials } from "./_components/tenant-finance-credentials";
import { TenantInfrastructureCard } from "./_components/tenant-infrastructure-card";
import { TenantIntegrationStatus } from "./_components/tenant-integration-status";
import { TenantLicensePanel } from "./_components/tenant-license-panel";
import { TenantModulesPanel } from "./_components/tenant-modules-panel";
import { TenantPosCredentials } from "./_components/tenant-pos-credentials";
import { TenantProfileForm } from "./_components/tenant-profile-form";
import { TenantProvisionEvents } from "./_components/tenant-provision-events";
import { TenantProvisioningAlerts } from "./_components/tenant-provisioning-alerts";
import { useTenantDetailPage } from "./_components/use-tenant-detail-page";

export default function TenantDetailPage() {
  const {
    id,
    isSuper,
    tenant,
    events,
    loading,
    eventsLoading,
    error,
    setError,
    editing,
    setEditing,
    saving,
    profileForm,
    saveProfile,
    loadTenant,
    loadEvents,
    deploymentStatus,
    isProvisioning,
    shouldPollProvisioning,
    provisionPollTimedOut,
    setProvisionPollTimedOut,
    resetProvisionPollStartedAt,
    stopProvisionOpen,
    setStopProvisionOpen,
    openStopProvision,
    baseUrl,
    posUrl,
    canRevealPosPins,
    posOrgHref,
    handleModulesChanged,
    licenseReloadToken,
  } = useTenantDetailPage();

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

      <TenantProvisioningAlerts
        tenant={tenant}
        isProvisioning={isProvisioning}
        provisionPollTimedOut={provisionPollTimedOut}
        provisionPartial={provisionPartial}
        onProvisionPollTimedOutChange={setProvisionPollTimedOut}
        onProvisionPollStartedAtReset={resetProvisionPollStartedAt}
        onReload={loadTenant}
        onReloadEvents={loadEvents}
        onStopProvisionOpen={openStopProvision}
        onError={setError}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <TenantProfileForm
          tenant={tenant}
          editing={editing}
          onEditingChange={setEditing}
          profileForm={profileForm}
          saving={saving}
          onSave={saveProfile}
          modulesSection={
            <TenantModulesPanel
              tenant={tenant}
              tenantId={id}
              isSuper={isSuper}
              onModulesChanged={handleModulesChanged}
            />
          }
        />

        <TenantInfrastructureCard
          tenant={tenant}
          baseUrl={baseUrl}
          posUrl={posUrl}
          isSuper={isSuper}
          provisionFailed={provisionFailed}
          onReload={loadTenant}
          onReloadEvents={loadEvents}
          onError={setError}
        />

        <TenantFinanceCredentials
          tenant={tenant}
          baseUrl={baseUrl}
          isSuper={isSuper}
          onTenantReload={loadTenant}
        />

        <TenantPosCredentials
          tenant={tenant}
          tenantId={id}
          posUrl={posUrl}
          posOrgHref={posOrgHref}
          canRevealPosPins={canRevealPosPins}
        />

        <TenantIntegrationStatus
          tenant={tenant}
          posOrgHref={posOrgHref}
          onTenantReload={loadTenant}
        />

        <TenantBrandingPanel tenantId={id} />
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
            !isProvisioning
            && (tenant.deployment?.status ?? "").toLowerCase() === "active"
            && tenant.deployment != null
            && Number(tenant.deployment.internalPort) > 0
          }
          financeTenantId={tenant.deployment?.financeTenantId ?? null}
        />
      </div>

      <TenantLicensePanel
        tenant={tenant}
        tenantId={id}
        isSuper={isSuper}
        reloadToken={licenseReloadToken}
      />

      <TenantProvisionEvents
        events={events}
        eventsLoading={eventsLoading}
        shouldPollProvisioning={shouldPollProvisioning}
        provisionPollTimedOut={provisionPollTimedOut}
        isProvisioning={isProvisioning}
        onRefresh={() => void loadEvents()}
      />

      <TenantDangerZone
        tenant={tenant}
        isProvisioning={isProvisioning}
        stopProvisionOpen={stopProvisionOpen}
        onStopProvisionOpenChange={setStopProvisionOpen}
        onReload={loadTenant}
        onReloadEvents={loadEvents}
        onError={setError}
      />
    </div>
  );
}
