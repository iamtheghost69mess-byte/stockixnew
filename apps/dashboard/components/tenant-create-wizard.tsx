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
import { cn } from "@/lib/utils";
import type { LicenseRow } from "@/types/license";
import type { ProvisionEventRow } from "@/types/tenant";

export type TenantCreateDialogControl = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type PlanOpt = { slug: string; name: string; description: string | null };

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
  const rootDomain = publicConfig.stockixRootDomain;
  const prevDialogOpen = useRef(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/plans");
      const data = (await res.json().catch(() => ({}))) as {
        plans?: { slug: string; name: string; description: string | null }[];
      };
      if (res.ok && data.plans?.length) {
        setPlans(
          data.plans.map((p) => ({
            slug: p.slug,
            name: p.name,
            description: p.description ?? null,
          })),
        );
        setPlanSlug((prev) =>
          data.plans!.some((p) => p.slug === prev) ? prev : data.plans![0]!.slug,
        );
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
  };

  const wizardBody = (
    <>
      <div className="space-y-4 pt-1">
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
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Plan</p>
              <div className="grid grid-cols-2 gap-2">
                {plans.map((p) => (
                  <button
                    key={p.slug}
                    type="button"
                    className={cn(
                      "rounded-lg border p-3 text-left text-sm transition-all",
                      planSlug === p.slug ? "ring-2 ring-primary" : "hover:bg-muted/50",
                    )}
                    onClick={() => setPlanSlug(p.slug)}
                  >
                    <p className="font-semibold">{p.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{p.description ?? " "}</p>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>License</Label>
              <div className="space-y-2">
                <button
                  type="button"
                  className={cn(
                    "w-full rounded-lg border p-3 text-left text-sm",
                    licenseMode === "auto" ? "ring-2 ring-primary" : "hover:bg-muted/50",
                  )}
                  onClick={() => {
                    setLicenseMode("auto");
                    setExistingLicenseId("");
                  }}
                >
                  <p className="font-medium">Auto-generate new license</p>
                  <p className="text-xs text-muted-foreground">
                    A platform license will be created and assigned automatically
                  </p>
                </button>
                <button
                  type="button"
                  disabled={unassignedLicenses.length === 0}
                  className={cn(
                    "w-full rounded-lg border p-3 text-left text-sm",
                    licenseMode === "existing" ? "ring-2 ring-primary" : "hover:bg-muted/50",
                    unassignedLicenses.length === 0 ? "opacity-50" : "",
                  )}
                  onClick={() => {
                    setLicenseMode("existing");
                    setExistingLicenseId((prev) => prev || unassignedLicenses[0]?.id || "");
                  }}
                >
                  <p className="font-medium">Use existing unassigned license</p>
                  <p className="text-xs text-muted-foreground">
                    {unassignedLicenses.length === 0
                      ? "No unassigned licenses available"
                      : "Pick a platform license from the pool"}
                  </p>
                </button>
              </div>
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
          className="max-h-[min(90vh,720px)] overflow-y-auto sm:max-w-md"
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
