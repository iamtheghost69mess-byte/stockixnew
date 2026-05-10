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
import type { ProvisionEventRow } from "@/types/tenant";

export type TenantCreateDialogControl = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

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
  }) => Promise<void>;
  onReset: () => void;
  /** When set, the wizard opens in a modal instead of an inline card. */
  dialog?: TenantCreateDialogControl;
};

function StepDots({ step }: { step: number }) {
  return (
    <div className="flex gap-2" aria-hidden>
      {[1, 2, 3].map((n) => (
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
  const rootDomain = publicConfig.stockixRootDomain;
  const prevDialogOpen = useRef(false);

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
    }
    prevDialogOpen.current = dialog.open;
  }, [dialog]);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail);
  const slugOk = /^[a-z0-9][a-z0-9-]{1,}[a-z0-9]$/.test(slug);
  const step1Valid =
    name.trim().length > 0 &&
    adminFirstName.trim().length > 0 &&
    adminLastName.trim().length > 0 &&
    emailOk;
  const step2Valid = slugOk;

  const submit = async () => {
    setFormError(null);
    try {
      await onProvision({
        slug: slug.trim(),
        name: name.trim(),
        adminEmail: adminEmail.trim(),
        adminFirstName: adminFirstName.trim(),
        adminLastName: adminLastName.trim(),
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
  };

  const wizardBody = (
    <>
      <div className="space-y-4 pt-1">
        {step === 1 ? (
          <div className="space-y-3">
            <p className="text-sm font-medium">Step 1 of 3 — Business details</p>
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
            <p className="text-sm font-medium">Step 2 of 3 — Subdomain</p>
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
          <div className="space-y-3">
            <p className="text-sm font-medium">Step 3 of 3 — Review</p>
            <div className="space-y-1 text-sm">
              <p>Business: {name}</p>
              <p>
                Subdomain: {slug}.{rootDomain}
              </p>
              <p>Admin email: {adminEmail}</p>
              <p>
                Admin name: {adminFirstName} {adminLastName}
              </p>
            </div>
            {formError ? (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            ) : null}
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(2)}>
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
