"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatPosMutationError } from "@/lib/format-pos-api-error";
import {
  fetchReceiptConfig,
  updateReceiptConfig,
  type LocationReceiptConfig,
  type LocationReceiptSurface,
  type ReceiptConfigPayload,
} from "@/lib/inventory-api";
import type { PosApiJson } from "@/lib/pos-api-fetch";
import { getPosLocationScopeId } from "@/lib/pos-location-scope";

const DEFAULT_CONFIG: LocationReceiptConfig = {
  headerLine1: "",
  headerLine2: "",
  footerLine: "Thank you",
  showBranchName: true,
  showBranchAddress: true,
  showBranchPhone: false,
  showTaxVatNumber: false,
};

const DEFAULT_SURFACE: LocationReceiptSurface = {
  receiptLogo: "",
  receiptHeader: "",
  receiptFooter: "",
  receiptShowVAT: true,
  receiptShowServiceCharge: true,
};

export default function ReceiptConfigPage() {
  const [draft, setDraft] = useState<LocationReceiptConfig>(DEFAULT_CONFIG);
  const [surface, setSurface] = useState<LocationReceiptSurface>(DEFAULT_SURFACE);
  const locationScopeId = useMemo(() => getPosLocationScopeId(), []);

  const query = useQuery({
    queryKey: ["receipt-config", locationScopeId],
    queryFn: fetchReceiptConfig,
    enabled: Boolean(locationScopeId && locationScopeId !== "all"),
  });

  useEffect(() => {
    const payload = query.data as PosApiJson<ReceiptConfigPayload> | undefined;
    if (!payload?.data) return;
    if (payload.data.receiptConfig) {
      setDraft({
        ...DEFAULT_CONFIG,
        ...payload.data.receiptConfig,
      });
    }
    const d = payload.data;
    setSurface({
      receiptLogo: d.receiptLogo ?? "",
      receiptHeader: d.receiptHeader ?? "",
      receiptFooter: d.receiptFooter ?? "",
      receiptShowVAT: d.receiptShowVAT !== false,
      receiptShowServiceCharge: d.receiptShowServiceCharge !== false,
    });
  }, [query.data]);

  const mutation = useMutation({
    mutationFn: () =>
      updateReceiptConfig({
        receiptConfig: draft,
        receiptLogo: surface.receiptLogo,
        receiptHeader: surface.receiptHeader,
        receiptFooter: surface.receiptFooter,
        receiptShowVAT: surface.receiptShowVAT,
        receiptShowServiceCharge: surface.receiptShowServiceCharge,
      }),
    onSuccess: () => {
      toast.success("Receipt config saved.");
      void query.refetch();
    },
    onError: (error: unknown) => {
      toast.error(formatPosMutationError(error));
    },
  });

  const disabledScope = !locationScopeId || locationScopeId === "all";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-3xl tracking-tight">Receipt Config</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Branch-level receipt header/footer and visibility controls.
        </p>
      </div>

      {disabledScope ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-sm">
              Select a concrete branch scope first (not `all`) to edit receipt settings.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Header & Footer</CardTitle>
          <CardDescription>Printed on every customer receipt for this branch.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="receipt-header-1">Header line 1</Label>
            <Input
              id="receipt-header-1"
              value={draft.headerLine1}
              disabled={disabledScope}
              maxLength={120}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, headerLine1: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="receipt-header-2">Header line 2</Label>
            <Input
              id="receipt-header-2"
              value={draft.headerLine2}
              disabled={disabledScope}
              maxLength={120}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, headerLine2: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="receipt-footer">Footer line</Label>
            <Input
              id="receipt-footer"
              value={draft.footerLine}
              disabled={disabledScope}
              maxLength={160}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, footerLine: event.target.value }))
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Receipt branding & blocks</CardTitle>
          <CardDescription>
            Top-level location fields used by the printer (logo URL, optional HTML-style text blocks, VAT / service
            toggles).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="receipt-logo">Logo URL</Label>
            <Input
              id="receipt-logo"
              value={surface.receiptLogo}
              disabled={disabledScope}
              placeholder="https://…"
              onChange={(e) => setSurface((s) => ({ ...s, receiptLogo: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="receipt-block-header">Receipt header block</Label>
            <Input
              id="receipt-block-header"
              value={surface.receiptHeader}
              disabled={disabledScope}
              maxLength={2000}
              onChange={(e) => setSurface((s) => ({ ...s, receiptHeader: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="receipt-block-footer">Receipt footer block</Label>
            <Input
              id="receipt-block-footer"
              value={surface.receiptFooter}
              disabled={disabledScope}
              maxLength={2000}
              onChange={(e) => setSurface((s) => ({ ...s, receiptFooter: e.target.value }))}
            />
          </div>
          <div className="flex flex-wrap gap-6">
            <div className="flex items-center justify-between gap-4 rounded-md border p-3">
              <Label>Show VAT line on receipt</Label>
              <Switch
                checked={surface.receiptShowVAT}
                disabled={disabledScope}
                onCheckedChange={(checked) => setSurface((s) => ({ ...s, receiptShowVAT: checked }))}
              />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-md border p-3">
              <Label>Show service charge line</Label>
              <Switch
                checked={surface.receiptShowServiceCharge}
                disabled={disabledScope}
                onCheckedChange={(checked) => setSurface((s) => ({ ...s, receiptShowServiceCharge: checked }))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
          <CardDescription>Approximate layout (narrow ticket).</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mx-auto max-w-xs rounded border border-dashed bg-muted/30 p-4 font-mono text-[10px] leading-relaxed">
            {surface.receiptLogo ? (
              <img src={surface.receiptLogo} alt="" className="mx-auto mb-2 max-h-12 object-contain" />
            ) : null}
            <div className="whitespace-pre-wrap">{surface.receiptHeader || draft.headerLine1 || " "}</div>
            <div className="mt-2 whitespace-pre-wrap text-muted-foreground">{draft.headerLine2}</div>
            <div className="my-2 border-t border-dashed" />
            <div>— line items —</div>
            <div className="my-2 border-t border-dashed" />
            {surface.receiptShowVAT ? <div className="text-muted-foreground">VAT: (sample)</div> : null}
            {surface.receiptShowServiceCharge ? (
              <div className="text-muted-foreground">Service: (sample)</div>
            ) : null}
            <div className="mt-2 whitespace-pre-wrap">{surface.receiptFooter || draft.footerLine}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Visibility</CardTitle>
          <CardDescription>Show/hide branch metadata sections on the receipt.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            ["showBranchName", "Show branch name"],
            ["showBranchAddress", "Show branch address"],
            ["showBranchPhone", "Show branch phone"],
            ["showTaxVatNumber", "Show VAT number"],
          ].map(([key, label]) => (
            <div key={key} className="flex items-center justify-between rounded-md border p-3">
              <Label>{label}</Label>
              <Switch
                checked={Boolean(draft[key as keyof LocationReceiptConfig])}
                disabled={disabledScope}
                onCheckedChange={(checked) =>
                  setDraft((prev) => ({
                    ...prev,
                    [key]: checked,
                  }))
                }
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Button
        type="button"
        disabled={disabledScope || mutation.isPending || query.isLoading}
        onClick={() => mutation.mutate()}
      >
        {(mutation.isPending || query.isLoading) && (
          <Loader2 className="mr-2 size-4 animate-spin" />
        )}
        Save Receipt Config
      </Button>
    </div>
  );
}
