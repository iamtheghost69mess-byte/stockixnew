"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { publicConfig } from "@repo/config/public";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ProvisionEventRow } from "@/types/tenant";

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
};

export default function TenantCreateWizard(props: Props) {
  const {
    loading,
    provisionLog,
    elapsedSec,
    oneTimePassword,
    tenantAccess,
    onProvision,
    onReset,
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>New tenant</CardTitle>
        <div className="flex gap-2">
          {[1, 2, 3].map((n) => (
            <span
              key={n}
              className={`h-2.5 w-2.5 rounded-full ${step >= n ? "bg-primary" : "bg-muted"}`}
            />
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
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
              <span className="font-mono">{slug || "<slug>"}.{rootDomain}</span>
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
              <p>Subdomain: {slug}.{rootDomain}</p>
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onReset();
              setStep(1);
              setName("");
              setAdminFirstName("");
              setAdminLastName("");
              setAdminEmail("");
              setSlug("");
            }}
          >
            Start another tenant
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
