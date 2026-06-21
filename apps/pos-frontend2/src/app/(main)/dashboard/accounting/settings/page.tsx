"use client";

import { useEffect, useMemo, useState } from "react";

import Link from "next/link";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  posEnsureAccountingDefaults,
  posFetchAccountingConfig,
  posFetchAccounts,
  posRunAutomationHooks,
  posTestAutomationWebhook,
  posUpdateAccountingConfig,
} from "@/lib/pos-accounting-api";
import { posCan } from "@/lib/pos-permissions";
import { posQueryKeys } from "@/lib/pos-query-keys";
import { accountingSettingsSaveSchema } from "@/lib/schemas/accounting/settings-save";
import { fieldErrorsFromZodError } from "@/lib/schemas/accounting/zod-field-errors";
import { usePosAuthStore } from "@/stores/pos-auth-store";

function refId(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && "_id" in v) return String((v as { _id: unknown })._id);
  return "";
}

type PayRow = { methodKey: string; account: string };
type TaxRow = { code: string; name: string; rate: string; kind: "sales" | "withholding"; account: string };

export default function AccountingSettingsPage() {
  const queryClient = useQueryClient();
  const permissions = usePosAuthStore((s) => s.user?.permissions ?? []);
  const canRead = posCan(permissions, "backoffice.accounting.read");
  const canWrite = posCan(permissions, "backoffice.accounting.write");

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounting", "accounts"],
    queryFn: () => posFetchAccounts(),
    enabled: canRead,
  });

  const {
    data: cfg,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["accounting", "config"],
    queryFn: posFetchAccountingConfig,
    enabled: canRead,
  });

  const [autoPostOnPaid, setAutoPostOnPaid] = useState(false);
  const [autoPostCogsOnPaid, setAutoPostCogsOnPaid] = useState(false);
  const [companyCurrency, setCompanyCurrency] = useState("USD");
  const [defaultCostMethod, setDefaultCostMethod] = useState("fifo");
  const [kitchenFlowMode, setKitchenFlowMode] = useState<"station_tickets" | "kitchen_display">("station_tickets");
  const [strictOversell, setStrictOversell] = useState(true);
  const [reserveStockOnPending, setReserveStockOnPending] = useState(false);
  const [inventoryAlertsEnabled, setInventoryAlertsEnabled] = useState(false);
  const [inventoryExpiryAlertDays, setInventoryExpiryAlertDays] = useState("7");
  const [inventoryAlertWebhookUrl, setInventoryAlertWebhookUrl] = useState("");
  const [automationWebhookEnabled, setAutomationWebhookEnabled] = useState(false);
  const [automationWebhookUrl, setAutomationWebhookUrl] = useState("");

  const [defaultRevenueAccount, setDefaultRevenueAccount] = useState("");
  const [defaultCashAccount, setDefaultCashAccount] = useState("");
  const [defaultCardClearingAccount, setDefaultCardClearingAccount] = useState("");
  const [defaultAccountsReceivableAccount, setDefaultAccountsReceivableAccount] = useState("");
  const [defaultTaxPayableAccount, setDefaultTaxPayableAccount] = useState("");
  const [defaultServiceChargePayableAccount, setDefaultServiceChargePayableAccount] = useState("");
  const [retainedEarningsAccount, setRetainedEarningsAccount] = useState("");
  const [defaultPurchasesExpenseAccount, setDefaultPurchasesExpenseAccount] = useState("");
  const [defaultCustomerDepositAccount, setDefaultCustomerDepositAccount] = useState("");
  const [requireApprovalsForVendorPosting, setRequireApprovalsForVendorPosting] = useState(false);
  const [requireApprovalsForExpensePosting, setRequireApprovalsForExpensePosting] = useState(false);

  const [paymentRows, setPaymentRows] = useState<PayRow[]>([]);
  const [taxRows, setTaxRows] = useState<TaxRow[]>([]);

  const [ensureOpen, setEnsureOpen] = useState(false);
  const [settingsFieldErrors, setSettingsFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!cfg) return;
    setAutoPostOnPaid(!!cfg.autoPostOnPaid);
    setAutoPostCogsOnPaid(!!cfg.autoPostCogsOnPaid);
    setCompanyCurrency(String(cfg.companyCurrency ?? "USD").toUpperCase());
    const cm = String(cfg.defaultCostMethod ?? "fifo").toLowerCase();
    setDefaultCostMethod(
      cm === "weighted_average" || cm === "standard" || cm === "fefo" ? cm : "fifo",
    );
    const kfm = String(cfg.kitchenFlowMode ?? "station_tickets").toLowerCase();
    setKitchenFlowMode(kfm === "kitchen_display" ? "kitchen_display" : "station_tickets");
    setStrictOversell(cfg.strictOversell !== false);
    setReserveStockOnPending(!!cfg.reserveStockOnPending);
    setInventoryAlertsEnabled(!!cfg.inventoryAlertsEnabled);
    setInventoryExpiryAlertDays(String(cfg.inventoryExpiryAlertDays ?? 7));
    setInventoryAlertWebhookUrl(String(cfg.inventoryAlertWebhookUrl ?? ""));
    setAutomationWebhookEnabled(!!cfg.automationWebhookEnabled);
    setAutomationWebhookUrl(String(cfg.automationWebhookUrl ?? ""));

    setDefaultRevenueAccount(refId(cfg.defaultRevenueAccount));
    setDefaultCashAccount(refId(cfg.defaultCashAccount));
    setDefaultCardClearingAccount(refId(cfg.defaultCardClearingAccount));
    setDefaultAccountsReceivableAccount(refId(cfg.defaultAccountsReceivableAccount));
    setDefaultTaxPayableAccount(refId(cfg.defaultTaxPayableAccount));
    setDefaultServiceChargePayableAccount(refId(cfg.defaultServiceChargePayableAccount));
    setRetainedEarningsAccount(refId(cfg.retainedEarningsAccount));
    setDefaultPurchasesExpenseAccount(refId(cfg.defaultPurchasesExpenseAccount));
    setDefaultCustomerDepositAccount(refId(cfg.defaultCustomerDepositAccount));
    setRequireApprovalsForVendorPosting(!!cfg.requireApprovalsForVendorPosting);
    setRequireApprovalsForExpensePosting(!!cfg.requireApprovalsForExpensePosting);

    const pm = Array.isArray(cfg.paymentMethodAccounts) ? cfg.paymentMethodAccounts : [];
    setPaymentRows(
      pm.length
        ? pm.map((m) => ({
            methodKey: String(m.methodKey ?? ""),
            account: refId(m.account),
          }))
        : [{ methodKey: "cash", account: refId(cfg.defaultCashAccount) }],
    );

    const tr = Array.isArray(cfg.taxRates) ? cfg.taxRates : [];
    setTaxRows(
      tr.length
        ? tr.map((t) => ({
            code: String(t.code ?? ""),
            name: String(t.name ?? ""),
            rate: String(t.rate ?? 0),
            kind: t.kind === "withholding" ? "withholding" : "sales",
            account: refId(t.account),
          }))
        : [],
    );
  }, [cfg]);

  const accountOptions = useMemo(
    () =>
      [...accounts]
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((a) => ({
          id: a._id,
          label: `${a.code} — ${a.name}`,
        })),
    [accounts],
  );

  const saveMut = useMutation({
    mutationFn: () => {
      const pm = paymentRows
        .filter((r) => r.methodKey.trim() && r.account)
        .map((r) => ({ methodKey: r.methodKey.trim().toLowerCase(), account: r.account }));
      const body: Record<string, unknown> = {
        autoPostOnPaid,
        autoPostCogsOnPaid,
        companyCurrency: companyCurrency.trim().toUpperCase() || "USD",
        defaultCostMethod,
        stockDeductTrigger: "payment",
        kitchenFlowMode,
        strictOversell,
        reserveStockOnPending,
        inventoryAlertsEnabled,
        inventoryExpiryAlertDays: Number(inventoryExpiryAlertDays) || 0,
        inventoryAlertWebhookUrl: inventoryAlertWebhookUrl.trim(),
        automationWebhookEnabled,
        automationWebhookUrl: automationWebhookUrl.trim(),
        defaultRevenueAccount: defaultRevenueAccount || null,
        defaultCashAccount: defaultCashAccount || null,
        defaultCardClearingAccount: defaultCardClearingAccount || null,
        defaultAccountsReceivableAccount: defaultAccountsReceivableAccount || null,
        defaultTaxPayableAccount: defaultTaxPayableAccount || null,
        defaultServiceChargePayableAccount: defaultServiceChargePayableAccount || null,
        retainedEarningsAccount: retainedEarningsAccount || null,
        defaultPurchasesExpenseAccount: defaultPurchasesExpenseAccount || null,
        defaultCustomerDepositAccount: defaultCustomerDepositAccount || null,
        requireApprovalsForVendorPosting,
        requireApprovalsForExpensePosting,
        paymentMethodAccounts: pm,
        taxRates: taxRows
          .filter((r) => r.code.trim() && r.account)
          .map((r) => ({
            code: r.code.trim(),
            name: r.name.trim(),
            rate: Number(r.rate) || 0,
            kind: r.kind,
            account: r.account,
          })),
      };
      return posUpdateAccountingConfig(body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounting", "config"] });
      queryClient.invalidateQueries({ queryKey: posQueryKeys.accountingConfig() });
      toast.success("GL settings saved.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save settings."),
  });

  function submitSettingsSave() {
    const parsed = accountingSettingsSaveSchema.safeParse({
      paymentRows,
      companyCurrency,
      inventoryExpiryAlertDays,
      inventoryAlertWebhookUrl,
    });
    if (!parsed.success) {
      setSettingsFieldErrors(fieldErrorsFromZodError(parsed.error));
      return;
    }
    setSettingsFieldErrors({});
    saveMut.mutate();
  }

  const ensureMut = useMutation({
    mutationFn: posEnsureAccountingDefaults,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounting", "config"] });
      queryClient.invalidateQueries({ queryKey: ["accounting", "accounts"] });
      toast.success("Default accounts and config were ensured.");
      setEnsureOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not ensure defaults."),
  });

  const runAutomationMut = useMutation({
    mutationFn: posRunAutomationHooks,
    onSuccess: (data) => {
      toast.success(
        `Automation complete: journals ${data.recurringJournalsPosted}, invoices ${data.recurringInvoicesIssued}.`
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not run automation."),
  });

  const testAutomationWebhookMut = useMutation({
    mutationFn: posTestAutomationWebhook,
    onSuccess: (data) => {
      if (data.sent) toast.success("Automation webhook test sent.");
      else toast.info(`Automation webhook skipped: ${data.reason}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not test webhook."),
  });

  if (!canRead) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">You do not have permission to view accounting settings.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <p className="text-destructive">{error instanceof Error ? error.message : "Failed to load config."}</p>
      </div>
    );
  }

  const AccountPick = ({
    id,
    label,
    value,
    onChange,
  }: {
    id: string;
    label: string;
    value: string;
    onChange: (v: string) => void;
  }) => (
    <div className="grid w-full min-w-0 gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value || "__none__"}
        onValueChange={(v) => onChange(v === "__none__" ? "" : v)}
        disabled={!canWrite}
      >
        <SelectTrigger id={id} className="h-10 w-full min-w-0">
          <SelectValue placeholder="Select account" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— None —</SelectItem>
          {accountOptions.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" className="mb-2 -ml-2" asChild>
            <Link href="/dashboard/accounting/accounts">
              <ArrowLeft className="mr-2 size-4" />
              Chart of accounts
            </Link>
          </Button>
          <h1 className="font-bold text-3xl tracking-tight">GL configuration</h1>
          <p className="text-muted-foreground text-sm">
            Posting rules, default accounts, tender mapping, and tax mapping for your tenant.
          </p>
        </div>
        {canWrite ? (
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setEnsureOpen(true)}>
              Ensure defaults
            </Button>
            <Button type="button" onClick={submitSettingsSave} disabled={saveMut.isPending}>
              {saveMut.isPending ? <Loader2 className="size-4 animate-spin" /> : "Save changes"}
            </Button>
          </div>
        ) : null}
      </div>

      <Card>
        <CardHeader className="space-y-1 pb-4">
          <CardTitle className="text-lg">Posting</CardTitle>
          <CardDescription>When journals are created from POS activity.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 pt-0 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
            <Label htmlFor="auto-post-paid">Auto-post on paid</Label>
            <Switch
              id="auto-post-paid"
              checked={autoPostOnPaid}
              onCheckedChange={setAutoPostOnPaid}
              disabled={!canWrite}
            />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
            <Label htmlFor="auto-post-cogs">Auto-post COGS on paid</Label>
            <Switch
              id="auto-post-cogs"
              checked={autoPostCogsOnPaid}
              onCheckedChange={setAutoPostCogsOnPaid}
              disabled={!canWrite}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-1 pb-4">
          <CardTitle className="text-lg">Approvals (maker–checker)</CardTitle>
          <CardDescription>
            When enabled, posting requires a matching approved entry in the approvals inbox first.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 pt-0 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
            <div className="space-y-0.5">
              <Label htmlFor="req-ap-vb">Vendor bill posting</Label>
              <p className="text-muted-foreground text-xs">Requires approved request for the bill id.</p>
            </div>
            <Switch
              id="req-ap-vb"
              checked={requireApprovalsForVendorPosting}
              onCheckedChange={setRequireApprovalsForVendorPosting}
              disabled={!canWrite}
            />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
            <div className="space-y-0.5">
              <Label htmlFor="req-ap-exp">Expense GL posting</Label>
              <p className="text-muted-foreground text-xs">
                Requires approved request in addition to document status approved.
              </p>
            </div>
            <Switch
              id="req-ap-exp"
              checked={requireApprovalsForExpensePosting}
              onCheckedChange={setRequireApprovalsForExpensePosting}
              disabled={!canWrite}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-1 pb-4">
          <CardTitle className="text-lg">Company &amp; inventory policy</CardTitle>
          <CardDescription>Operational defaults used with inventory and costing.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-x-6 gap-y-5 pt-0 md:grid-cols-2">
          <div className="grid w-full min-w-0 gap-2">
            <Label htmlFor="ccy">Company currency</Label>
            <Input
              id="ccy"
              className="h-10"
              value={companyCurrency}
              onChange={(e) => setCompanyCurrency(e.target.value)}
              disabled={!canWrite}
              maxLength={8}
            />
          </div>
          <div className="grid w-full min-w-0 gap-2">
            <Label>Default cost method</Label>
            <Select value={defaultCostMethod} onValueChange={setDefaultCostMethod} disabled={!canWrite}>
              <SelectTrigger className="h-10 w-full min-w-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fifo">FIFO</SelectItem>
                <SelectItem value="fefo">FEFO</SelectItem>
                <SelectItem value="weighted_average">Weighted average</SelectItem>
                <SelectItem value="standard">Standard</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid w-full min-w-0 gap-2">
            <Label>Stock deduct trigger</Label>
            <Input
              className="h-10 bg-muted/40"
              readOnly
              disabled
              value="Payment (when order is paid)"
              title="POS inventory is always deducted on paid orders."
            />
            <p className="text-muted-foreground text-xs">
              Legacy values in the database are normalized to payment. Kitchen-send-only deduction is no longer
              offered.
            </p>
          </div>
          <div className="grid w-full min-w-0 gap-2">
            <Label>Kitchen mode</Label>
            <Select
              value={kitchenFlowMode}
              onValueChange={(value: "station_tickets" | "kitchen_display") => setKitchenFlowMode(value)}
              disabled={!canWrite}
            >
              <SelectTrigger className="h-10 w-full min-w-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="station_tickets">Station tickets (print by category)</SelectItem>
                <SelectItem value="kitchen_display">Kitchen display (no station print)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
            <Label htmlFor="strict-over">Strict oversell</Label>
            <Switch
              id="strict-over"
              checked={strictOversell}
              onCheckedChange={setStrictOversell}
              disabled={!canWrite}
            />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
            <Label htmlFor="reserve">Reserve stock on pending</Label>
            <Switch
              id="reserve"
              checked={reserveStockOnPending}
              onCheckedChange={setReserveStockOnPending}
              disabled={!canWrite}
            />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
            <Label htmlFor="inv-alerts">Inventory alerts enabled</Label>
            <Switch
              id="inv-alerts"
              checked={inventoryAlertsEnabled}
              onCheckedChange={setInventoryAlertsEnabled}
              disabled={!canWrite}
            />
          </div>
          <div className="grid w-full min-w-0 gap-2">
            <Label htmlFor="exp-days">Expiry alert days</Label>
            <Input
              id="exp-days"
              className="h-10"
              type="number"
              value={inventoryExpiryAlertDays}
              onChange={(e) => setInventoryExpiryAlertDays(e.target.value)}
              disabled={!canWrite}
            />
          </div>
          <div className="grid w-full min-w-0 gap-2">
            <Label htmlFor="webhook">Inventory alert webhook URL</Label>
            <Input
              id="webhook"
              className="h-10"
              value={inventoryAlertWebhookUrl}
              onChange={(e) => setInventoryAlertWebhookUrl(e.target.value)}
              disabled={!canWrite}
              placeholder="https://…"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-1 pb-4">
          <CardTitle className="text-lg">Scheduling &amp; automation hooks</CardTitle>
          <CardDescription>
            Manual trigger for due recurring jobs and optional completion webhook.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 pt-0 md:grid-cols-2">
          <div className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
            <Label htmlFor="auto-hook-enable">Automation webhook enabled</Label>
            <Switch
              id="auto-hook-enable"
              checked={automationWebhookEnabled}
              onCheckedChange={setAutomationWebhookEnabled}
              disabled={!canWrite}
            />
          </div>
          <div className="grid w-full min-w-0 gap-2">
            <Label htmlFor="auto-hook-url">Automation webhook URL</Label>
            <Input
              id="auto-hook-url"
              className="h-10"
              value={automationWebhookUrl}
              onChange={(e) => setAutomationWebhookUrl(e.target.value)}
              disabled={!canWrite}
              placeholder="https://..."
            />
          </div>
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => runAutomationMut.mutate()}
              disabled={!canWrite || runAutomationMut.isPending}
            >
              {runAutomationMut.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Run automation now
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => testAutomationWebhookMut.mutate()}
              disabled={!canWrite || testAutomationWebhookMut.isPending}
            >
              {testAutomationWebhookMut.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Test webhook
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-1 pb-4">
          <CardTitle className="text-lg">Default GL accounts</CardTitle>
          <CardDescription>Used when posting sales, tenders, AR, tax, and vendor bills.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-x-6 gap-y-5 pt-0 md:grid-cols-2">
          <AccountPick
            id="def-rev"
            label="Default revenue"
            value={defaultRevenueAccount}
            onChange={setDefaultRevenueAccount}
          />
          <AccountPick id="def-cash" label="Default cash" value={defaultCashAccount} onChange={setDefaultCashAccount} />
          <AccountPick
            id="def-card"
            label="Card / clearing"
            value={defaultCardClearingAccount}
            onChange={setDefaultCardClearingAccount}
          />
          <AccountPick
            id="def-ar"
            label="Accounts receivable"
            value={defaultAccountsReceivableAccount}
            onChange={setDefaultAccountsReceivableAccount}
          />
          <AccountPick
            id="def-cust-dep"
            label="Customer deposits (AR overpayments)"
            value={defaultCustomerDepositAccount}
            onChange={setDefaultCustomerDepositAccount}
          />
          <AccountPick
            id="def-purch-exp"
            label="Purchases / non-stock expense (vendor bills)"
            value={defaultPurchasesExpenseAccount}
            onChange={setDefaultPurchasesExpenseAccount}
          />
          <AccountPick
            id="def-tax"
            label="Tax payable"
            value={defaultTaxPayableAccount}
            onChange={setDefaultTaxPayableAccount}
          />
          <AccountPick
            id="def-svc-charge"
            label="Service charge payable"
            value={defaultServiceChargePayableAccount}
            onChange={setDefaultServiceChargePayableAccount}
          />
          <AccountPick
            id="def-re"
            label="Retained earnings"
            value={retainedEarningsAccount}
            onChange={setRetainedEarningsAccount}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-4 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">Payment method → account</CardTitle>
            <CardDescription>Maps POS tender keys (e.g. cash, card) to GL accounts.</CardDescription>
          </div>
          {canWrite ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setPaymentRows((r) => [...r, { methodKey: "", account: "" }])}
            >
              <Plus className="mr-1 size-4" />
              Row
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          {settingsFieldErrors.paymentRows ? (
            <p className="text-destructive text-sm">{settingsFieldErrors.paymentRows}</p>
          ) : null}
          {paymentRows.map((row, i) => (
            <div
              key={`pm-${i}-${row.methodKey}`}
              className="grid items-end gap-3 rounded-lg border bg-muted/20 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]"
            >
              <div className="grid min-w-0 gap-2">
                <Label>Method key</Label>
                <Input
                  className="h-10"
                  value={row.methodKey}
                  onChange={(e) => {
                    setPaymentRows((rows) => rows.map((x, j) => (j === i ? { ...x, methodKey: e.target.value } : x)));
                    setSettingsFieldErrors((p) => ({ ...p, paymentRows: "" }));
                  }}
                  disabled={!canWrite}
                  placeholder="cash"
                />
              </div>
              <div className="grid min-w-0 gap-2">
                <Label>Account</Label>
                <Select
                  value={row.account || "__none__"}
                  onValueChange={(v) => {
                    setPaymentRows((rows) =>
                      rows.map((x, j) => (j === i ? { ...x, account: v === "__none__" ? "" : v } : x)),
                    );
                    setSettingsFieldErrors((p) => ({ ...p, paymentRows: "" }));
                  }}
                  disabled={!canWrite}
                >
                  <SelectTrigger className="h-10 w-full min-w-0">
                    <SelectValue placeholder="Account" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {accountOptions.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {canWrite ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 justify-self-end sm:justify-self-center"
                  aria-label="Remove row"
                  onClick={() => setPaymentRows((rows) => rows.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-4" />
                </Button>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-4 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">Tax rates</CardTitle>
            <CardDescription>Each code maps to a liability (or withholding) account.</CardDescription>
          </div>
          {canWrite ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setTaxRows((r) => [...r, { code: "", name: "", rate: "0", kind: "sales", account: "" }])}
            >
              <Plus className="mr-1 size-4" />
              Row
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          {taxRows.length === 0 ? <p className="text-muted-foreground text-sm">No tax rates configured.</p> : null}
          {taxRows.map((row, i) => (
            <div
              key={`tx-${i}-${row.code}`}
              className="grid gap-3 rounded-lg border bg-muted/20 p-4 lg:grid-cols-[minmax(0,6rem)_minmax(0,1fr)_5.5rem_minmax(0,8rem)_minmax(0,1.5fr)_auto] lg:items-end"
            >
              <div className="grid min-w-0 gap-2">
                <Label>Code</Label>
                <Input
                  className="h-10"
                  value={row.code}
                  onChange={(e) =>
                    setTaxRows((rows) => rows.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)))
                  }
                  disabled={!canWrite}
                />
              </div>
              <div className="grid min-w-0 gap-2">
                <Label>Name</Label>
                <Input
                  className="h-10"
                  value={row.name}
                  onChange={(e) =>
                    setTaxRows((rows) => rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                  }
                  disabled={!canWrite}
                />
              </div>
              <div className="grid min-w-0 gap-2">
                <Label>Rate %</Label>
                <Input
                  className="h-10"
                  value={row.rate}
                  onChange={(e) =>
                    setTaxRows((rows) => rows.map((x, j) => (j === i ? { ...x, rate: e.target.value } : x)))
                  }
                  disabled={!canWrite}
                />
              </div>
              <div className="grid min-w-0 gap-2">
                <Label>Kind</Label>
                <Select
                  value={row.kind}
                  onValueChange={(v) =>
                    setTaxRows((rows) => rows.map((x, j) => (j === i ? { ...x, kind: v as TaxRow["kind"] } : x)))
                  }
                  disabled={!canWrite}
                >
                  <SelectTrigger className="h-10 w-full min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sales">Sales</SelectItem>
                    <SelectItem value="withholding">Withholding</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid min-w-0 gap-2 lg:col-span-1">
                <Label>Account</Label>
                <Select
                  value={row.account || "__none__"}
                  onValueChange={(v) =>
                    setTaxRows((rows) =>
                      rows.map((x, j) => (j === i ? { ...x, account: v === "__none__" ? "" : v } : x)),
                    )
                  }
                  disabled={!canWrite}
                >
                  <SelectTrigger className="h-10 w-full min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {accountOptions.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {canWrite ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 justify-self-end lg:justify-self-center"
                  aria-label="Remove tax row"
                  onClick={() => setTaxRows((rows) => rows.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-4" />
                </Button>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={ensureOpen} onOpenChange={setEnsureOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ensure default accounts?</DialogTitle>
            <DialogDescription>
              Seeds standard chart codes and config if missing. Safe to run more than once; existing custom codes may
              conflict if they overlap defaults.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEnsureOpen(false)} disabled={ensureMut.isPending}>
              Cancel
            </Button>
            <Button type="button" onClick={() => ensureMut.mutate()} disabled={ensureMut.isPending}>
              {ensureMut.isPending ? <Loader2 className="size-4 animate-spin" /> : "Run"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
