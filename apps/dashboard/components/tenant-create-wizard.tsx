"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { publicConfig } from "@repo/config/public";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  deploySummaryForModules,
  findProfileForModules,
  formatModulesList,
  MODULE_CATALOG,
  modulesEqual,
  parseLicenseModules,
  PROVISION_PROFILES,
  profileModules,
  sortModules,
  type ProvisionProfileId,
  type StockixModuleId,
} from "@/lib/tenant-modules";
import type { LicenseRow } from "@/types/license";
import type { ProvisionEventRow } from "@/types/tenant";

export type TenantCreateDialogControl = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export type { StockixModuleId };

type PlanOpt = { slug: string; name: string; description: string | null };

type Props = {
  loading: boolean;
  provisionLog: ProvisionEventRow[];
  elapsedSec: number;
  oneTimePassword: string | null;
  posDefaultCredentials?: {
    adminPin: string;
    allRoles: { role: string; username: string; pin: string }[];
  } | null;
  tenantAccess: { publicUrl: string | null; adminEmail: string } | null;
  onProvision: (data: {
    slug: string;
    name: string;
    adminEmail: string;
    adminFirstName: string;
    adminLastName: string;
    planSlug: string;
    modules: StockixModuleId[];
    assignExistingLicenseId: string | null;
  }) => Promise<void>;
  onReset: () => void;
  dialog?: TenantCreateDialogControl;
};

function StepDots({ step }: { step: number }) {
  return (
    <div className="flex gap-2" aria-hidden>
      {[1, 2, 3, 4].map((n) => (
        <span
          key={n}
          className={`h-2.5 w-2.5 rounded-full ${step >= n ? "bg-primary" : "bg-muted"}`}
        />
      ))}
    </div>
  );
}

function ModuleBadges({ modules }: { modules: StockixModuleId[] }) {
  if (modules.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {sortModules(modules).map((mod) => {
        const meta = MODULE_CATALOG.find((m) => m.id === mod);
        return (
          <Badge key={mod} variant={mod === "accounting" ? "default" : "secondary"}>
            {meta?.label ?? mod}
          </Badge>
        );
      })}
    </span>
  );
}

function licenseModules(license: LicenseRow): StockixModuleId[] {
  return parseLicenseModules(license.modules ?? ["accounting"]);
}

export default function TenantCreateWizard(props: Props) {
  const {
    loading,
    provisionLog,
    elapsedSec,
    oneTimePassword,
    posDefaultCredentials = null,
    tenantAccess,
    onProvision,
    onReset,
    dialog,
  } = props;
  void { loading, provisionLog, elapsedSec };

  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [adminFirstName, setAdminFirstName] = useState("");
  const [adminLastName, setAdminLastName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [slug, setSlug] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlanOpt[]>([]);
  const [planSlug, setPlanSlug] = useState("starter");
  const [licenseMode, setLicenseMode] = useState<"auto" | "existing">("auto");
  const [unassignedLicenses, setUnassignedLicenses] = useState<LicenseRow[]>([]);
  const [existingLicenseId, setExistingLicenseId] = useState<string>("");
  const [provisionProfile, setProvisionProfile] =
    useState<ProvisionProfileId>("accounting_only");
  const [selectedModules, setSelectedModules] = useState<StockixModuleId[]>([
    "accounting",
  ]);
  const rootDomain = publicConfig.stockixRootDomain;
  const prevDialogOpen = useRef(false);

  const activeProfile = PROVISION_PROFILES.find((p) => p.id === provisionProfile);
  const selectedLicense = unassignedLicenses.find((l) => l.id === existingLicenseId);

  const deploySummary = useMemo(
    () =>
      provisionProfile !== "custom" && activeProfile
        ? activeProfile.deploySummary
        : deploySummaryForModules(selectedModules),
    [provisionProfile, activeProfile, selectedModules],
  );

  const licenseModulesMismatch = useMemo(() => {
    if (licenseMode !== "existing" || !selectedLicense) return false;
    return !modulesEqual(selectedModules, licenseModules(selectedLicense));
  }, [licenseMode, selectedLicense, selectedModules]);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/plans");
      const data = (await res.json().catch(() => ({}))) as {
        plans?: { slug: string; name: string; description: string | null; isActive?: boolean }[];
      };
      if (res.ok && data.plans?.length) {
        const active = data.plans.filter((p) => p.isActive !== false);
        setPlans(
          active.map((p) => ({
            slug: p.slug,
            name: p.name,
            description: p.description ?? null,
          })),
        );
        if (active.length > 0) {
          setPlanSlug((prev) => (active.some((p) => p.slug === prev) ? prev : active[0]!.slug));
        }
      }
    })();
  }, []);

  useEffect(() => {
    if (step !== 3) return;
    void (async () => {
      const res = await fetch("/api/licenses?status=unassigned&product=platform&pageSize=100");
      const data = (await res.json().catch(() => ({}))) as { licenses?: LicenseRow[] };
      if (res.ok) setUnassignedLicenses(data.licenses ?? []);
    })();
  }, [step]);

  const resetWizardFields = () => {
    setStep(1);
    setFormError(null);
    setName("");
    setAdminFirstName("");
    setAdminLastName("");
    setAdminEmail("");
    setSlug("");
    setPlanSlug(plans[0]?.slug ?? "starter");
    setLicenseMode("auto");
    setExistingLicenseId("");
    setProvisionProfile("accounting_only");
    setSelectedModules(["accounting"]);
  };

  useEffect(() => {
    if (!dialog) {
      prevDialogOpen.current = false;
      return;
    }
    if (dialog.open && !prevDialogOpen.current) {
      resetWizardFields();
    }
    prevDialogOpen.current = dialog.open;
  }, [dialog, plans]);

  const applyProfile = (profileId: ProvisionProfileId) => {
    setProvisionProfile(profileId);
    if (profileId !== "custom") {
      setSelectedModules(profileModules(profileId));
    }
  };

  const applyExistingLicense = (licenseId: string) => {
    setExistingLicenseId(licenseId);
    const lic = unassignedLicenses.find((l) => l.id === licenseId);
    if (!lic) return;
    const mods = licenseModules(lic);
    setSelectedModules(mods);
    setProvisionProfile(findProfileForModules(mods));
  };

  const toggleCustomModule = (id: StockixModuleId) => {
    setProvisionProfile("custom");
    setSelectedModules((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((m) => m !== id);
        return next.length > 0 ? next : ["accounting"];
      }
      return sortModules([...prev, id]);
    });
  };

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail);
  const slugOk = /^[a-z0-9][a-z0-9-]{1,}[a-z0-9]$/.test(slug);
  const step1Valid =
    name.trim().length > 0 &&
    adminFirstName.trim().length > 0 &&
    adminLastName.trim().length > 0 &&
    emailOk;
  const step2Valid = slugOk;
  const selectedPlanName = plans.find((p) => p.slug === planSlug)?.name ?? planSlug;
  const step3Valid =
    planSlug.length > 0 &&
    selectedModules.length > 0 &&
    !licenseModulesMismatch &&
    (licenseMode === "auto" || (licenseMode === "existing" && existingLicenseId.length > 0));

  const submit = async () => {
    setFormError(null);
    try {
      await onProvision({
        slug: slug.trim(),
        name: name.trim(),
        adminEmail: adminEmail.trim(),
        adminFirstName: adminFirstName.trim(),
        adminLastName: adminLastName.trim(),
        planSlug,
        modules: sortModules(selectedModules),
        assignExistingLicenseId: licenseMode === "existing" ? existingLicenseId : null,
      });
    } catch (e) {
      setFormError(String(e));
    }
  };

  const resetAll = () => {
    onReset();
    resetWizardFields();
  };

  const profileTitle =
    activeProfile?.title ??
    (provisionProfile === "custom" ? "Custom module bundle" : "—");

  const wizardBody = (
    <>
      <div className="min-w-0 space-y-4 pt-1">
        {step === 1 ? (
          <div className="space-y-3">
            <p className="text-sm font-medium">Step 1 of 4 — Business details</p>
            <Input
              placeholder="Business / display name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              placeholder="Admin first name"
              value={adminFirstName}
              onChange={(e) => setAdminFirstName(e.target.value)}
            />
            <Input
              placeholder="Admin last name"
              value={adminLastName}
              onChange={(e) => setAdminLastName(e.target.value)}
            />
            <Input
              type="email"
              placeholder="Admin email (Finance login)"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
            />
            <div className="flex justify-end">
              <Button disabled={!step1Valid} onClick={() => setStep(2)}>
                Next
              </Button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-3">
            <p className="text-sm font-medium">Step 2 of 4 — Subdomain</p>
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="acme-corp" />
            <p className="text-xs text-muted-foreground">
              Finance URL:{" "}
              <span className="font-mono">
                {slug || "<slug>"}.{rootDomain}
              </span>
              {selectedModules.includes("pos") ? (
                <>
                  {" "}
                  · POS:{" "}
                  <span className="font-mono">
                    {slug || "<slug>"}-pos.{rootDomain}
                  </span>
                </>
              ) : null}
            </p>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button disabled={!step2Valid} onClick={() => setStep(3)}>
                Next
              </Button>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-5">
            <p className="text-sm font-medium">Step 3 of 4 — Product &amp; license</p>

            <div className="min-w-0 space-y-2">
              <Label className="text-sm">Deployment profile</Label>
              <p className="text-xs text-muted-foreground">
                Choose what this tenant receives. Worker module gating must be enabled in production
                for profiles to control which Docker stacks are deployed.
              </p>
              <ToggleGroup
                multiple={false}
                value={provisionProfile ? [provisionProfile] : []}
                onValueChange={(value) => {
                  const next = value[0] as ProvisionProfileId | undefined;
                  if (next) applyProfile(next);
                }}
                variant="outline"
                spacing={2}
                className="grid w-full min-w-0 grid-cols-1 gap-2.5"
              >
                {PROVISION_PROFILES.map((profile) => (
                  <ToggleGroupItem
                    key={profile.id}
                    value={profile.id}
                    className="flex h-auto min-h-0 w-full min-w-0 max-w-full shrink flex-col items-start justify-start gap-1 whitespace-normal rounded-lg px-3 py-3 text-left text-pretty shadow-none"
                  >
                    <span className="flex w-full items-center gap-2">
                      <span className="text-sm font-semibold leading-tight">{profile.title}</span>
                      {profile.id !== "custom" ? (
                        <ModuleBadges modules={profile.modules} />
                      ) : null}
                    </span>
                    <span className="w-full text-xs font-normal leading-snug text-muted-foreground">
                      {profile.subtitle}
                    </span>
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            <Alert>
              <AlertDescription className="space-y-2 text-sm">
                <p className="font-medium text-foreground">{deploySummary}</p>
                {activeProfile?.integrationNote ? (
                  <p className="text-xs text-muted-foreground">{activeProfile.integrationNote}</p>
                ) : null}
              </AlertDescription>
            </Alert>

            {provisionProfile === "custom" ? (
              <div className="min-w-0 space-y-2 rounded-lg border p-3">
                <Label className="text-sm">Modules in this bundle</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {MODULE_CATALOG.map((mod) => {
                    const checked = selectedModules.includes(mod.id);
                    return (
                      <label
                        key={mod.id}
                        className="flex cursor-pointer gap-3 rounded-md border p-3 has-checked:border-primary"
                      >
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={checked}
                          onChange={() => toggleCustomModule(mod.id)}
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{mod.label}</span>
                          <span className="block text-xs text-muted-foreground">
                            {mod.description}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="min-w-0 space-y-2">
              <Label className="text-sm">Subscription plan</Label>
              <ToggleGroup
                multiple={false}
                value={planSlug ? [planSlug] : []}
                onValueChange={(value) => {
                  const next = value[0];
                  if (next) setPlanSlug(next);
                }}
                variant="outline"
                spacing={2}
                className="grid w-full min-w-0 grid-cols-1 gap-2.5 sm:grid-cols-2"
              >
                {plans.map((p) => (
                  <ToggleGroupItem
                    key={p.slug}
                    value={p.slug}
                    className="flex h-auto min-h-18 w-full min-w-0 flex-col items-start gap-1 rounded-lg px-3 py-3 text-left shadow-none"
                  >
                    <span className="text-sm font-semibold">{p.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {p.description?.trim() ? p.description : "—"}
                    </span>
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            <div className="min-w-0 space-y-2">
              <Label className="text-sm">License</Label>
              <ToggleGroup
                multiple={false}
                value={[licenseMode]}
                onValueChange={(value) => {
                  const next = value[0];
                  if (next === "auto") {
                    setLicenseMode("auto");
                    setExistingLicenseId("");
                  } else if (next === "existing") {
                    setLicenseMode("existing");
                    const first = unassignedLicenses[0];
                    if (first) applyExistingLicense(first.id);
                  }
                }}
                variant="outline"
                spacing={2}
                orientation="vertical"
                className="grid w-full gap-2.5"
              >
                <ToggleGroupItem
                  value="auto"
                  className="flex h-auto w-full flex-col items-start gap-1 rounded-lg px-3 py-3 text-left shadow-none"
                >
                  <span className="text-sm font-medium">Auto-generate license</span>
                  <span className="text-xs text-muted-foreground">
                    Creates a platform license with modules:{" "}
                    <ModuleBadges modules={selectedModules} />
                  </span>
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="existing"
                  disabled={unassignedLicenses.length === 0}
                  className="flex h-auto w-full flex-col items-start gap-1 rounded-lg px-3 py-3 text-left shadow-none disabled:opacity-60"
                >
                  <span className="text-sm font-medium">Use existing unassigned license</span>
                  <span className="text-xs text-muted-foreground">
                    {unassignedLicenses.length === 0
                      ? "No unassigned platform licenses in the pool"
                      : "Modules on the license must match the deployment profile"}
                  </span>
                </ToggleGroupItem>
              </ToggleGroup>

              {licenseMode === "existing" && unassignedLicenses.length > 0 ? (
                <Select
                  value={existingLicenseId}
                  onValueChange={(v) => applyExistingLicense(v ?? "")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select license" />
                  </SelectTrigger>
                  <SelectContent>
                    {unassignedLicenses.map((l) => {
                      const mods = licenseModules(l);
                      return (
                        <SelectItem key={l.id} value={l.id}>
                          <span className="flex flex-col gap-0.5 py-0.5">
                            <span className="font-mono text-xs">{l.licenseKey}</span>
                            <span className="text-xs text-muted-foreground">
                              {l.planSlug} · {formatModulesList(mods)}
                            </span>
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              ) : null}

              {licenseMode === "existing" && selectedLicense ? (
                <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs">
                  <p className="font-medium text-foreground">Selected license modules</p>
                  <div className="mt-1">
                    <ModuleBadges modules={licenseModules(selectedLicense)} />
                  </div>
                </div>
              ) : null}

              {licenseModulesMismatch ? (
                <Alert variant="destructive">
                  <AlertDescription>
                    Deployment profile modules do not match the selected license. Change profile or
                    pick another license.
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button disabled={!step3Valid} onClick={() => setStep(4)}>
                Next
              </Button>
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-4">
            <p className="text-sm font-medium">Step 4 of 4 — Review &amp; provision</p>
            <div className="space-y-3 rounded-lg border p-4 text-sm">
              <div className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <p className="font-medium">{name}</p>
                  <p className="text-xs text-muted-foreground">
                    {slug}.{rootDomain}
                    {selectedModules.includes("pos")
                      ? ` · ${slug}-pos.${rootDomain}`
                      : ""}
                  </p>
                </div>
              </div>
              <dl className="grid gap-2 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Admin</dt>
                  <dd>
                    {adminFirstName} {adminLastName} · {adminEmail}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Plan</dt>
                  <dd>{selectedPlanName}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">Deployment profile</dt>
                  <dd className="mt-1 space-y-1">
                    <span className="font-medium">{profileTitle}</span>
                    <ModuleBadges modules={selectedModules} />
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">What will deploy</dt>
                  <dd className="mt-0.5 text-muted-foreground">{deploySummary}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">License</dt>
                  <dd>
                    {licenseMode === "auto"
                      ? `Auto-generate (${formatModulesList(selectedModules)})`
                      : `${selectedLicense?.licenseKey ?? "—"} · ${formatModulesList(
                          selectedLicense ? licenseModules(selectedLicense) : [],
                        )}`}
                  </dd>
                </div>
              </dl>
            </div>
            {formError ? (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            ) : null}
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(3)}>
                Back
              </Button>
              <Button disabled={loading} onClick={() => void submit()}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Provisioning...
                  </>
                ) : (
                  "Provision tenant"
                )}
              </Button>
            </div>
          </div>
        ) : null}

        {oneTimePassword || tenantAccess ? (
          <Button variant="outline" size="sm" onClick={resetAll}>
            Start another tenant
          </Button>
        ) : null}
      </div>
    </>
  );

  if (dialog) {
    return (
      <Dialog open={dialog.open} onOpenChange={dialog.onOpenChange}>
        <DialogContent
          className="max-h-[min(92vh,800px)] min-w-0 max-w-[calc(100vw-2rem)] overflow-y-auto overflow-x-hidden sm:max-w-xl"
          showCloseButton={!loading}
        >
          <DialogHeader>
            <DialogTitle>Add tenant</DialogTitle>
            <DialogDescription>
              Choose a deployment profile (POS only, Accounting only, or connected ERP), then
              provision isolated infrastructure for this customer.
            </DialogDescription>
            <StepDots step={step} />
          </DialogHeader>
          {wizardBody}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New tenant</CardTitle>
        <StepDots step={step} />
      </CardHeader>
      <CardContent className="space-y-4">{wizardBody}</CardContent>
    </Card>
  );
}
