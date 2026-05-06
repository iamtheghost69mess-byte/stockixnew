"use client";

import { useEffect, useState } from "react";
import { Copy, Loader2 } from "lucide-react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type MfaStatus = { enabled: boolean; setupPending: boolean };

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

export default function SettingsPage() {
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [setupSecret, setSetupSecret] = useState("");
  const [otpauthUri, setOtpauthUri] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  const [disableCode, setDisableCode] = useState("");
  const [disableSubmitting, setDisableSubmitting] = useState(false);

  const loadStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/security/mfa/status");
      const data = (await readJson(res)) as { enabled?: boolean; setupPending?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setStatus({
        enabled: Boolean(data.enabled),
        setupPending: Boolean(data.setupPending),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStatus();
  }, []);

  const beginSetup = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/security/mfa/begin", {
        method: "POST",
      });
      const data = (await readJson(res)) as {
        secret?: string;
        otpauthUri?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setSetupSecret(data.secret ?? "");
      setOtpauthUri(data.otpauthUri ?? "");
      if (data.otpauthUri) {
        const nextQr = await QRCode.toDataURL(data.otpauthUri, {
          width: 220,
          margin: 1,
          errorCorrectionLevel: "M",
        });
        setQrDataUrl(nextQr);
      } else {
        setQrDataUrl("");
      }
      setSetupCode("");
      await loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const enableMfa = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/security/mfa/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: setupCode }),
      });
      const data = (await readJson(res)) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setSetupSecret("");
      setOtpauthUri("");
      setQrDataUrl("");
      setSetupCode("");
      await loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const disableMfa = async () => {
    setError(null);
    setDisableSubmitting(true);
    try {
      const res = await fetch("/api/security/mfa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: disableCode }),
      });
      const data = (await readJson(res)) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setDisableCode("");
      await loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDisableSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Security controls for your platform owner account.
        </p>
      </div>

      <div className="rounded-lg border p-4 space-y-4">
        <div>
          <h2 className="text-sm font-semibold">Multi-factor authentication (MFA)</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            MFA is required for Super Admin privileged actions in production.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Manage MFA for your account through API-backed actions below.
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading MFA status...</p>
        ) : (
          <p className="text-sm">
            Status:{" "}
            <span className={status?.enabled ? "text-emerald-600" : "text-amber-600"}>
              {status?.enabled ? "Enabled" : "Disabled"}
            </span>
          </p>
        )}

        {error ? (
          <p className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {!status?.enabled ? (
          <div className="space-y-3">
            <Button onClick={() => void beginSetup()} disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Start MFA setup
            </Button>

            {setupSecret ? (
              <div className="rounded border bg-muted/30 p-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Scan this QR code in your authenticator app, then enter the 6-digit code to verify.
                </p>
                {qrDataUrl ? (
                  <div className="rounded border bg-white p-2 w-fit">
                    <img
                      src={qrDataUrl}
                      alt="MFA setup QR code"
                      className="h-[220px] w-[220px]"
                    />
                  </div>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  If scanning is unavailable, you can add it manually with this setup key:
                </p>
                <div className="flex items-center gap-2">
                  <code className="rounded bg-background px-2 py-1 text-xs break-all">{setupSecret}</code>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      await navigator.clipboard.writeText(setupSecret);
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 1500);
                    }}
                  >
                    <Copy className="mr-1 h-3 w-3" />
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                {otpauthUri ? (
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer">Show OTP URI</summary>
                    <code className="mt-2 block break-all rounded bg-background px-2 py-1">
                      {otpauthUri}
                    </code>
                  </details>
                ) : null}
                <div className="flex items-end gap-2">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Verification code</label>
                    <Input
                      value={setupCode}
                      onChange={(e) => setSetupCode(e.target.value)}
                      placeholder="123456"
                      className="w-32"
                      maxLength={8}
                    />
                  </div>
                  <Button onClick={() => void enableMfa()} disabled={!setupCode || submitting}>
                    Verify & Enable
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              To disable MFA, provide your current authenticator code.
            </p>
            <div className="flex items-end gap-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Authenticator code</label>
                <Input
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value)}
                  placeholder="123456"
                  className="w-32"
                  maxLength={8}
                />
              </div>
              <Button
                variant="destructive"
                onClick={() => void disableMfa()}
                disabled={!disableCode || disableSubmitting}
              >
                {disableSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Disable MFA
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
