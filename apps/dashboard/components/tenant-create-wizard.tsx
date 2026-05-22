"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { publicConfig } from "@repo/config/public";

import { Alert, AlertDescription } from "@/components/ui/alert";
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
import type { LicenseRow } from "@/types/license";
import type { ProvisionEventRow } from "@/types/tenant";

export type TenantCreateDialogControl = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type PlanOpt = { slug: string; name: string; description: string | null };

export type StockixModuleId = "accounting" | "pos" | "pms" | "chat";

const AVAILABLE_MODULES: {
  id: StockixModuleId;
  label: string;
  description: string;
}[] = [
  {
    id: "accounting",
    label: "Accounting (Finance)",
    description: "Full double-entry GL, invoicing, reporting",
  },
  {
    id: "pos",
    label: "Point of Sale",
    description: "Restaurant POS, tables, kitchen, orders",
  },
  {
    id: "pms",
    label: "Property Management",
    description: "Hotel/villa bookings, rooms, guests",
  },
  {
    id: "chat",
    label: "Messaging (Chatwoot)",
    description: "WhatsApp, Instagram, unified inbox",
  },
];

type Props = {
  loading: boolean;
  provisionLog: ProvisionEventRow[];
  elapsedSec: number;
  oneTimePassword: string | null;
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
  /** When set, the wizard opens in a modal instead of an inline card. */
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

export default function TenantCreateWizard(props: Props) {
  const {
    loading,
    provisionLog,
    elapsedSec,
    oneTimePassword,
    tenantAccess,
    onProvision,
    onReset,
    dialog,
  } = props;
  const _provisionUi = { loading, provisionLog, elapsedSec };
  void _provisionUi;
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
  const [selectedModules, setSelectedModules] = useState<StockixModuleId[]>(["accounting"]);
  const rootDomain = publicConfig.stockixRootDomain;
  const prevDialogOpen = useRef(false);

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

  useEffect(() => {
    if (!dialog) {
      prevDialogOpen.current = false;
      return;
    }
    if (dialog.open && !prevDialogOpen.current) {
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
      setSelectedModules(["accounting"]);
    }
    prevDialogOpen.current = dialog.open;
  }, [dialog, plans]);

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
    planSlug.length > 0
    && selectedModules.length > 0
    && (licenseMode === "auto" || (licenseMode === "existing" && existingLicenseId.length > 0));

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
        modules: selectedModules,
        assignExistingLicenseId: licenseMode === "existing" ? existingLicenseId : null,
      });
    } catch (e) {
      setFormError(String(e));
    }
  };

  const resetAll = () => {
    onReset();
    setStep(1);
    setName("");
    setAdminFirstName("");
    setAdminLastName("");
    setAdminEmail("");
    setSlug("");
    setFormError(null);
    setPlanSlug(plans[0]?.slug ?? "starter");
    setLicenseMode("auto");
    setExistingLicenseId("");
    setSelectedModules(["accounting"]);
  };

  const toggleModule = (id: StockixModuleId) => {
    setSelectedModules((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((m) => m !== id);
        return next.length > 0 ? next : ["accounting"];
      }
      return [...prev, id];
    });
  };

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
              placeholder="Admin email"
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
              Your tenant will be available at:{" "}
              <span className="font-mono">
                {slug || "<slug>"}.{rootDomain}
              </span>
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
          <div className="space-y-4">
            <p className="text-sm font-medium">Step 3 of 4 — Plan &amp; license</p>
            <div className="min-w-0">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Plan</p>
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
                    className="flex h-auto min-h-[5.25rem] w-full min-w-0 max-w-full shrink flex-col items-start justify-start gap-1.5 whitespace-normal rounded-lg px-3 py-3 text-left break-words shadow-none [text-wrap:pretty]"
                  >
                    <span className="w-full text-sm font-semibold leading-tight">{p.name}</span>
                    <span className="w-full text-xs font-normal leading-snug text-muted-foreground">
                      {p.description?.trim() ? p.description : "—"}
                    </span>
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <div className="min-w-0 space-y-2">
              <Label>Products</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {AVAILABLE_MODULES.map((mod) => {
                  const checked = selectedModules.includes(mod.id);
                  return (
                    <label
                      key={mod.id}
                      className="flex cursor-pointer gap-3 rounded-lg border p-3 has-[:checked]:border-primary"
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={checked}
                        onChange={() => toggleModule(mod.id)}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{mod.label}</span>
                        <span className="block text-xs text-muted-foreground">{mod.description}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="min-w-0 space-y-2">
              <Label>License</Label>
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
                    setExistingLicenseId((prev) => prev || unassignedLicenses[0]?.id || "");
                  }
                }}
                variant="outline"
                spacing={2}
                orientation="vertical"
                className="grid w-full min-w-0 gap-2.5"
              >
                <ToggleGroupItem
                  value="auto"
                  className="flex h-auto min-h-0 w-full min-w-0 max-w-full shrink flex-col items-start justify-start gap-1.5 whitespace-normal rounded-lg px-3 py-3 text-left break-words shadow-none [text-wrap:pretty]"
                >
                  <span className="w-full text-sm font-medium leading-tight">Auto-generate new license</span>
                  <span className="w-full text-xs font-normal leading-snug text-muted-foreground">
                    A platform license will be created and assigned automatically.
                  </span>
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="existing"
                  disabled={unassignedLicenses.length === 0}
                  className="flex h-auto min-h-0 w-full min-w-0 max-w-full shrink flex-col items-start justify-start gap-1.5 whitespace-normal rounded-lg px-3 py-3 text-left break-words shadow-none [text-wrap:pretty] disabled:opacity-60"
                >
                  <span className="w-full text-sm font-medium leading-tight">Use existing unassigned license</span>
                  <span className="w-full text-xs font-normal leading-snug text-muted-foreground">
                    {unassignedLicenses.length === 0
                      ? "No unassigned licenses available"
                      : "Pick a platform license from the pool"}
                  </span>
                </ToggleGroupItem>
              </ToggleGroup>
              {licenseMode === "existing" && unassignedLicenses.length > 0 ? (
                <Select
                  value={existingLicenseId}
                  onValueChange={(v) => setExistingLicenseId(v ?? "")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select license" />
                  </SelectTrigger>
                  <SelectContent>
                    {unassignedLicenses.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.licenseKey} ({l.planSlug})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
          <div className="space-y-3">
            <p className="text-sm font-medium">Step 4 of 4 — Review</p>
            <div className="space-y-1 text-sm">
              <p>Business: {name}</p>
              <p>
                Subdomain: {slug}.{rootDomain}
              </p>
              <p>Admin email: {adminEmail}</p>
              <p>
                Admin name: {adminFirstName} {adminLastName}
              </p>
              <p>Plan: {selectedPlanName}</p>
              <p>
                Products:{" "}
                {selectedModules
                  .map((id) => AVAILABLE_MODULES.find((m) => m.id === id)?.label ?? id)
                  .join(", ")}
              </p>
              <p>
                License:{" "}
                {licenseMode === "auto"
                  ? "Auto-generate on provision"
                  : unassignedLicenses.find((l) => l.id === existingLicenseId)?.licenseKey ?? "—"}
              </p>
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
          className="max-h-[min(90vh,720px)] min-w-0 max-w-[calc(100vw-2rem)] overflow-y-auto overflow-x-hidden sm:max-w-lg"
          showCloseButton={!loading}
        >
          <DialogHeader>
            <DialogTitle>Add tenant</DialogTitle>
            <DialogDescription>
              Create a new isolated tenant stack. Provisioning runs after you confirm — you can
              monitor progress on this page.
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
