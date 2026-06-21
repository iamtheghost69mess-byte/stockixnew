"use client";

import { useEffect, useRef, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Circle, Lock, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PhoneInput } from "@/components/reui/phone-input";
import { posUploadImage } from "@/lib/pos-upload-api";
import { completeSetupWizard, fetchSetupStatus, patchSetupStep } from "@/lib/setup-api";

// ─── Static data ──────────────────────────────────────────────────────────────

const STEPS = [
  { n: 1, label: "Business Identity", subtitle: "Business name, country, timezone, and receipt branding." },
  { n: 2, label: "Inventory Policy", subtitle: "How stock is consumed and costed during sales." },
  { n: 3, label: "First Zone", subtitle: "Name your branch and create your first floor zone." },
  { n: 4, label: "Launch", subtitle: "Final readiness check before going live." },
] as const;

const COUNTRIES = [
  "Algeria", "Australia", "Bahrain", "Canada", "Egypt", "France", "Germany",
  "India", "Iraq", "Jordan", "Kuwait", "Lebanon", "Libya", "Morocco", "Oman",
  "Pakistan", "Palestine", "Qatar", "Saudi Arabia", "Singapore", "Syria",
  "Tunisia", "Turkey", "UAE", "United Kingdom", "United States", "Yemen",
];

const TIMEZONES = [
  { label: "UTC (Universal)", value: "UTC" },
  { label: "Africa/Cairo (UTC+2)", value: "Africa/Cairo" },
  { label: "Asia/Amman (UTC+2/+3)", value: "Asia/Amman" },
  { label: "Asia/Baghdad (UTC+3)", value: "Asia/Baghdad" },
  { label: "Asia/Bahrain (UTC+3)", value: "Asia/Bahrain" },
  { label: "Asia/Beirut (UTC+2/+3)", value: "Asia/Beirut" },
  { label: "Asia/Dubai (UTC+4)", value: "Asia/Dubai" },
  { label: "Asia/Istanbul (UTC+3)", value: "Asia/Istanbul" },
  { label: "Asia/Karachi (UTC+5)", value: "Asia/Karachi" },
  { label: "Asia/Kolkata (UTC+5:30)", value: "Asia/Kolkata" },
  { label: "Asia/Kuwait (UTC+3)", value: "Asia/Kuwait" },
  { label: "Asia/Muscat (UTC+4)", value: "Asia/Muscat" },
  { label: "Asia/Qatar (UTC+3)", value: "Asia/Qatar" },
  { label: "Asia/Riyadh (UTC+3)", value: "Asia/Riyadh" },
  { label: "Asia/Singapore (UTC+8)", value: "Asia/Singapore" },
  { label: "Australia/Sydney (UTC+10/+11)", value: "Australia/Sydney" },
  { label: "Europe/London (UTC+0/+1)", value: "Europe/London" },
  { label: "Europe/Paris (UTC+1/+2)", value: "Europe/Paris" },
  { label: "America/New_York (UTC-5/-4)", value: "America/New_York" },
  { label: "America/Chicago (UTC-6/-5)", value: "America/Chicago" },
  { label: "America/Los_Angeles (UTC-8/-7)", value: "America/Los_Angeles" },
  { label: "America/Toronto (UTC-5/-4)", value: "America/Toronto" },
];

const COST_METHOD_HELP: Record<string, string> = {
  fifo: "Oldest received batch is consumed first. Recommended for most restaurants.",
  fefo: "Batch nearest to expiry is consumed first. Best for high-turnover fresh ingredients.",
  weighted_average: "Uses a blended moving average cost. No lot-tracking required.",
  standard: "Fixed cost per ingredient. Simplest option; costing variance is not tracked.",
};

const CHECKLIST_META: Record<
  string,
  { label: string; tier: "required" | "advisory"; hint?: string }
> = {
  mainLocationProfile: {
    label: "Business profile complete",
    tier: "required",
  },
  inventoryPolicyConfigured: {
    label: "Inventory policy configured",
    tier: "required",
  },
  hasAtLeastOneZone: {
    label: "At least one floor zone created",
    tier: "required",
  },
  posRegisterHasAssignedLocation: {
    label: "POS default location assigned",
    tier: "required",
  },
  hasStaffAssigned: {
    label: "Staff user exists",
    tier: "required",
  },
  hasMenuItemWithBom: {
    label: "Menu catalog configured",
    tier: "advisory",
    hint: "Add menu items and recipes from the Catalog module after launch.",
  },
  hasIngredientWithReorderRule: {
    label: "Ingredient reorder rules set",
    tier: "advisory",
    hint: "Configure reorder thresholds from the Inventory module after launch.",
  },
  openingStockEnteredIfRequired: {
    label: "Opening stock entered",
    tier: "advisory",
    hint: "Required for FIFO/FEFO before live orders. Add from Inventory → Stock Lots.",
  },
};

// ─── Form ─────────────────────────────────────────────────────────────────────

type FormState = {
  displayName: string;
  country: string;
  timezone: string;
  city: string;
  phone: string;
  address: string;
  taxVatNumber: string;
  receiptHeaderText: string;
  receiptFooterText: string;
  logoUrl: string;
  defaultCostMethod: string;
  stockDeductTrigger: string;
  strictOversellMode: string;
  mainLocationName: string;
  zoneName: string;
};

const INITIAL_FORM: FormState = {
  displayName: "",
  country: "",
  timezone: "",
  city: "",
  phone: "",
  address: "",
  taxVatNumber: "",
  receiptHeaderText: "",
  receiptFooterText: "",
  logoUrl: "",
  defaultCostMethod: "fifo",
  stockDeductTrigger: "payment",
  strictOversellMode: "block",
  mainLocationName: "",
  zoneName: "",
};

function validateStep(n: number, form: FormState): string | null {
  if (n === 1) {
    if (!form.displayName.trim()) return "Business name is required.";
    if (!form.country) return "Country is required.";
    if (!form.timezone) return "Timezone is required.";
  }
  if (n === 2) {
    if (!form.defaultCostMethod) return "Cost method is required.";
    if (!form.stockDeductTrigger) return "Stock deduct trigger is required.";
    if (!form.strictOversellMode) return "Oversell behavior is required.";
  }
  if (n === 3) {
    if (!form.zoneName.trim()) return "Zone name is required.";
  }
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SetupWizardClient() {
  const qc = useQueryClient();
  const hydratedRef = useRef(false);

  const [viewStep, setViewStep] = useState(1);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  const set = (key: keyof FormState) => (value: string) =>
    setForm((s) => ({ ...s, [key]: value }));

  const statusQ = useQuery({
    queryKey: ["setup", "status"],
    queryFn: fetchSetupStatus,
  });
  const status = statusQ.data?.data;
  const maxUnlocked = Math.min(4, Math.max(1, Number(status?.setupWizard?.currentStep || 1)));
  const completed = new Set<number>(status?.setupWizard?.completedSteps ?? []);
  const editingStep = Math.min(viewStep, maxUnlocked);

  // Hydrate form from server on first successful load
  useEffect(() => {
    if (hydratedRef.current || !status?.currentData) return;
    const d = status.currentData;
    setForm({
      displayName: d.displayName,
      country: d.country,
      timezone: d.timezone,
      city: d.city,
      phone: d.phone,
      address: d.address,
      taxVatNumber: d.taxVatNumber,
      receiptHeaderText: d.receiptHeaderText,
      receiptFooterText: d.receiptFooterText,
      logoUrl: d.logoUrl,
      defaultCostMethod: d.defaultCostMethod || "fifo",
      stockDeductTrigger: "payment",
      strictOversellMode: d.strictOversellMode || "block",
      mainLocationName: d.mainLocationName,
      zoneName: d.zoneName,
    });
    hydratedRef.current = true;
  }, [status?.currentData]);

  // Keep viewStep within valid range as maxUnlocked changes
  useEffect(() => {
    setViewStep((prev) => Math.min(prev, maxUnlocked));
  }, [maxUnlocked]);

  const saveMut = useMutation({
    mutationFn: async (stepNumber: number) => {
      const err = validateStep(stepNumber, form);
      if (err) throw new Error(err);
      return patchSetupStep(stepNumber, form as Record<string, unknown>);
    },
    onSuccess: (_data, stepNumber) => {
      toast.success(`Step ${stepNumber} saved.`);
      qc.invalidateQueries({ queryKey: ["setup", "status"] });
      setViewStep(Math.min(4, stepNumber + 1));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save step."),
  });

  const completeMut = useMutation({
    mutationFn: completeSetupWizard,
    onSuccess: () => {
      toast.success("Setup complete. Welcome to your POS.");
      // Hard redirect forces PosRootGate to remount and re-fetch setup status
      // from the DB (isComplete: true), preventing the stale-state redirect loop.
      window.location.replace("/pos");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Go-live failed."),
  });

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingLogo(true);
    try {
      const res = await posUploadImage(file);
      const url = String(res.data?.url || "").trim();
      if (!url) { toast.error("Upload succeeded but returned no URL."); return; }
      setForm((s) => ({ ...s, logoUrl: url }));
      toast.success("Logo uploaded.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Logo upload failed.");
    } finally {
      setIsUploadingLogo(false);
      e.currentTarget.value = "";
    }
  };

  const progressPercent = Math.round((editingStep / 4) * 100);
  const isFifoOrFefo = form.defaultCostMethod === "fifo" || form.defaultCostMethod === "fefo";

  // ── Render ───────────────────────────────────────────────────────────────

  if (statusQ.isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 p-6 lg:grid-cols-[220px_1fr]">
      {/* ── Sidebar ──────────────────────────────────────────────────── */}
      <Card className="h-fit">
        <CardHeader className="px-4 pt-4 pb-2">
          <CardTitle className="font-semibold text-muted-foreground text-sm uppercase tracking-wide">
            Setup
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 px-3 pb-4">
          {STEPS.map(({ n, label }) => {
            const done = completed.has(n);
            const isCurrent = n === editingStep;
            const locked = n > maxUnlocked;
            return (
              <button
                key={n}
                type="button"
                onClick={() => !locked && setViewStep(n)}
                disabled={locked}
                className={[
                  "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors",
                  isCurrent
                    ? "bg-primary font-medium text-primary-foreground"
                    : "text-foreground hover:bg-muted",
                  locked ? "cursor-not-allowed opacity-40" : "cursor-pointer",
                ].join(" ")}
              >
                {done ? (
                  <CheckCircle2
                    className={`size-4 shrink-0 ${isCurrent ? "" : "text-emerald-500"}`}
                  />
                ) : locked ? (
                  <Lock className="size-4 shrink-0" />
                ) : (
                  <Circle className="size-4 shrink-0" />
                )}
                <span className="truncate">{label}</span>
              </button>
            );
          })}
        </CardContent>
      </Card>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>{STEPS[editingStep - 1].label}</CardTitle>
              <CardDescription className="mt-1">
                {STEPS[editingStep - 1].subtitle}
              </CardDescription>
            </div>
            <Badge variant="outline" className="shrink-0 text-xs">
              {editingStep} / 4
            </Badge>
          </div>
          <Progress value={progressPercent} className="mt-3 h-1.5" />
        </CardHeader>

        <CardContent className="space-y-5 pb-24">
          {/* ────────────────────────────────────────────────────────────
              Step 1 — Business Identity
          ──────────────────────────────────────────────────────────── */}
          {editingStep === 1 && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5 md:col-span-2">
                <Label>
                  Business name <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={form.displayName}
                  onChange={(e) => set("displayName")(e.target.value)}
                  placeholder="e.g. The Coffee House"
                />
                <p className="text-muted-foreground text-xs">
                  Shown on receipts, menus, and customer-facing screens.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>
                  Country <span className="text-destructive">*</span>
                </Label>
                <Select value={form.country} onValueChange={set("country")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select country" />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>
                  Timezone <span className="text-destructive">*</span>
                </Label>
                <Select value={form.timezone} onValueChange={set("timezone")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>
                        {tz.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>City</Label>
                <Input
                  value={form.city}
                  onChange={(e) => set("city")(e.target.value)}
                  placeholder="e.g. Dubai"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Phone</Label>
                <PhoneInput
                  value={form.phone}
                  onChange={(v) => setForm((s) => ({ ...s, phone: String(v || "") }))}
                  placeholder="Enter phone number"
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <Label>Address</Label>
                <Input
                  value={form.address}
                  onChange={(e) => set("address")(e.target.value)}
                  placeholder="Street address"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Tax / VAT number</Label>
                <Input
                  value={form.taxVatNumber}
                  onChange={(e) => set("taxVatNumber")(e.target.value)}
                  placeholder="Optional"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Logo</Label>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  disabled={isUploadingLogo}
                />
                {isUploadingLogo && (
                  <p className="text-muted-foreground text-xs">Uploading…</p>
                )}
                {form.logoUrl && !isUploadingLogo && (
                  <p className="text-emerald-600 text-xs">Logo uploaded successfully.</p>
                )}
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <Label>Receipt header</Label>
                <Textarea
                  value={form.receiptHeaderText}
                  onChange={(e) => set("receiptHeaderText")(e.target.value)}
                  placeholder={
                    form.displayName
                      ? `Welcome to ${form.displayName}`
                      : "e.g. Welcome — thank you for dining with us."
                  }
                  rows={2}
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <Label>Receipt footer</Label>
                <Textarea
                  value={form.receiptFooterText}
                  onChange={(e) => set("receiptFooterText")(e.target.value)}
                  placeholder="e.g. Thank you for your visit. Returns accepted within 7 days with receipt."
                  rows={2}
                />
              </div>
            </div>
          )}

          {/* ────────────────────────────────────────────────────────────
              Step 2 — Inventory Policy
          ──────────────────────────────────────────────────────────── */}
          {editingStep === 2 && (
            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label>
                  How should item cost be calculated?{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={form.defaultCostMethod}
                  onValueChange={set("defaultCostMethod")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fifo">FIFO — oldest stock first (recommended)</SelectItem>
                    <SelectItem value="fefo">FEFO — nearest-expiry first</SelectItem>
                    <SelectItem value="weighted_average">Weighted Average</SelectItem>
                    <SelectItem value="standard">Standard Cost</SelectItem>
                  </SelectContent>
                </Select>
                {form.defaultCostMethod && (
                  <p className="text-muted-foreground text-xs">
                    {COST_METHOD_HELP[form.defaultCostMethod]}
                  </p>
                )}
                {isFifoOrFefo && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                    <p className="text-amber-700 text-xs dark:text-amber-400">
                      FIFO/FEFO requires opening stock before processing live orders.
                      You can add it from Inventory after launch.
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-1.5 rounded-md border bg-muted/30 p-3">
                <Label>When stock is deducted</Label>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Inventory for recipe-backed items is deducted when the order is <strong>paid</strong>. This matches
                  cash handling and avoids consuming stock on abandoned checks.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>
                  When an item is out of stock{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={form.strictOversellMode}
                  onValueChange={set("strictOversellMode")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="block">Block the order (recommended)</SelectItem>
                    <SelectItem value="warn">Allow with a warning</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-md border bg-muted/30 p-3 text-muted-foreground text-xs">
                Advanced inventory controls — alerts, webhooks, reservation strategy — are
                auto-configured with safe defaults and adjustable later in Settings.
              </div>
            </div>
          )}

          {/* ────────────────────────────────────────────────────────────
              Step 3 — First Zone
          ──────────────────────────────────────────────────────────── */}
          {editingStep === 3 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Location name</Label>
                <Input
                  value={form.mainLocationName}
                  onChange={(e) => set("mainLocationName")(e.target.value)}
                  placeholder="e.g. Main Branch"
                />
                <p className="text-muted-foreground text-xs">
                  Your primary branch name. Can be updated later from Locations.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>
                  First floor zone name <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={form.zoneName}
                  onChange={(e) => set("zoneName")(e.target.value)}
                  placeholder="e.g. Main Dining, Ground Floor, Rooftop"
                />
                <p className="text-muted-foreground text-xs">
                  Tables and orders are assigned to zones. Add more zones from Locations after
                  launch.
                </p>
              </div>

              <div className="rounded-md border bg-muted/30 p-3 text-muted-foreground text-xs">
                POS defaults, order flow, and staff permission baselines are automatically
                applied when you complete this step.
              </div>
            </div>
          )}

          {/* ────────────────────────────────────────────────────────────
              Step 4 — Launch
          ──────────────────────────────────────────────────────────── */}
          {editingStep === 4 && (
            <div className="space-y-6">
              {/* Required items */}
              <div className="space-y-2">
                <p className="font-medium text-sm">Required before launch</p>
                {Object.entries(status?.checklist ?? {})
                  .filter(
                    ([k]) => k !== "requiresOpeningStock" && CHECKLIST_META[k]?.tier === "required"
                  )
                  .map(([k, v]) => (
                    <div
                      key={k}
                      className="flex items-center justify-between rounded-md border px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        {v ? (
                          <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                        ) : (
                          <XCircle className="size-4 shrink-0 text-destructive" />
                        )}
                        <span className="text-sm">{CHECKLIST_META[k]?.label ?? k}</span>
                      </div>
                      <Badge variant={v ? "default" : "destructive"}>
                        {v ? "Ready" : "Missing"}
                      </Badge>
                    </div>
                  ))}
              </div>

              {/* Advisory items */}
              <div className="space-y-2">
                <p className="font-medium text-muted-foreground text-sm">Complete after launch</p>
                {Object.entries(status?.checklist ?? {})
                  .filter(
                    ([k]) => k !== "requiresOpeningStock" && CHECKLIST_META[k]?.tier === "advisory"
                  )
                  .map(([k, v]) => (
                    <div
                      key={k}
                      className="flex items-start justify-between rounded-md border px-3 py-2"
                    >
                      <div className="flex items-start gap-2">
                        {v ? (
                          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                        ) : (
                          <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        )}
                        <div>
                          <p className="text-sm">{CHECKLIST_META[k]?.label ?? k}</p>
                          {!v && CHECKLIST_META[k]?.hint && (
                            <p className="mt-0.5 text-muted-foreground text-xs">
                              {CHECKLIST_META[k].hint}
                            </p>
                          )}
                        </div>
                      </div>
                      <Badge variant="secondary" className="ml-2 shrink-0">
                        {v ? "Done" : "Later"}
                      </Badge>
                    </div>
                  ))}
              </div>

              {/* Blocking error */}
              {!status?.readyToGoLive && (status?.failedItems?.length ?? 0) > 0 && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                  <p className="text-destructive text-xs">
                    Complete the missing required items above before launching.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Sticky footer ──────────────────────────────────────────── */}
          <div className="sticky right-0 bottom-0 left-0 -mx-1 border-t bg-background/95 px-1 pt-4 backdrop-blur supports-backdrop-filter:bg-background/80">
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="outline"
                type="button"
                onClick={() => setViewStep((s) => Math.max(1, s - 1))}
                disabled={editingStep <= 1}
              >
                Back
              </Button>

              {editingStep < 4 ? (
                <Button
                  onClick={() => saveMut.mutate(editingStep)}
                  disabled={saveMut.isPending}
                >
                  {saveMut.isPending && (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  )}
                  Save & Continue
                </Button>
              ) : (
                <Button
                  onClick={() => completeMut.mutate()}
                  disabled={completeMut.isPending || !status?.readyToGoLive}
                >
                  {completeMut.isPending && (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  )}
                  Go Live
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
