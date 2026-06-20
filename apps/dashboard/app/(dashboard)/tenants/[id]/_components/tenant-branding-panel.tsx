"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/reusabletoast";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/card";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { formatApiError } from "@/lib/api-errors";

type TenantBrandingConfig = {
  appName: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  syncWarning?: string | null;
};

export function TenantBrandingPanel({ tenantId }: { tenantId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [appName, setAppName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#ca8a04");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/config`);
      const body = (await res.json()) as TenantBrandingConfig & { error?: string };
      if (!res.ok) {
        toast.error(formatApiError(body, "Failed to load branding"));
        return;
      }
      setAppName(body.appName ?? "");
      setLogoUrl(body.logoUrl ?? "");
      setPrimaryColor(body.primaryColor ?? "#ca8a04");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appName: appName.trim() || undefined,
          logoUrl: logoUrl.trim() ? logoUrl.trim() : null,
          primaryColor: primaryColor.trim() || null,
        }),
      });
      const body = (await res.json()) as TenantBrandingConfig & { error?: string };
      if (!res.ok) {
        toast.error(formatApiError(body, "Failed to save branding"));
        return;
      }
      if (body.syncWarning) {
        toast.warning(`Branding saved. ${body.syncWarning}`);
      } else {
        toast.success("Branding saved and synced to the Finance webapp.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Branding</CardTitle>
        <CardDescription>
          White-label settings for this tenant&apos;s Finance webapp. Changes are synced to the Finance
          stack in real time — no rebuild required. The logo field expects a publicly accessible URL
          (CDN, S3, etc.) that the user&apos;s browser can fetch directly.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="brand-app-name">Product name</Label>
              <Input
                id="brand-app-name"
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                placeholder="Acme Accounting"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="brand-logo-url">Logo URL</Label>
              <Input
                id="brand-logo-url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="brand-primary">Primary color</Label>
              <div className="flex items-center gap-3">
                <Input
                  id="brand-primary"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  placeholder="#ca8a04"
                  className="font-mono"
                />
                <span
                  className="size-8 shrink-0 rounded-md border"
                  style={{ backgroundColor: primaryColor }}
                  title={primaryColor}
                />
              </div>
            </div>
            <Button type="button" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save branding"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
