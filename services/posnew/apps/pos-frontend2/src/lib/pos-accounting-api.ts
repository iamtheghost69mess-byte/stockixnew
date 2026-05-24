/**
 * Accounting API client for the POS backend (`/api/accounting/*`).
 */
import { posApiFetch, posApiJson } from "@/lib/pos-api-fetch";

export const ACCOUNT_TYPES = ["asset", "liability", "equity", "revenue", "expense"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export type PosAccount = {
  _id: string;
  name: string;
  code: string;
  type: string;
  balance?: number;
  currency?: string;
  isActive?: boolean;
  sortOrder?: number;
};

export type TrialBalanceRow = {
  accountId?: string;
  code?: string;
  name?: string;
  type?: string;
  debit: number;
  credit: number;
  balance: number;
};

export type TrialBalanceResult = {
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
  locationId?: string | null;
  costCenter?: string | null;
};

export type ProfitLossReport = {
  period: { start: string | null; end: string | null };
  locationId?: string | null;
  costCenter?: string | null;
  byMonth?: Array<{ month: string; income: number; expenses: number }>;
  totalRevenue?: number;
  totalExpenses?: number;
  totalCogs?: number;
  netIncome?: number;
  grossProfit?: number;
  /** Percent of revenue; null when revenue is zero. */
  grossMarginPercent?: number | null;
  /** Net operating income as percent of revenue; null when revenue is zero. */
  netMarginPercent?: number | null;
  revenue: number;
  expense: number;
  cogs: number;
  netOperating: number;
  /** Full trial balance rollup for the P&amp;L period (same shape as `GET /trial-balance`). */
  trialBalance: TrialBalanceResult;
};

/** `GET /api/accounting/reports/cash-flow` — cash activity on mapped cash/clearing accounts by `cashFlowCategory` on journal entries. */
export type CashFlowStatement = {
  period: { start: string | null; end: string | null };
  locationId: string | null;
  costCenter?: string | null;
  categories: {
    operating: number;
    investing: number;
    financing: number;
    none: number;
    netChange: number;
  };
};

export type BalanceSheetLine = {
  accountId?: string;
  code?: string;
  name?: string;
  type?: string;
  debit?: number;
  credit?: number;
  balance?: number;
  netBalance?: number;
};

export type BalanceSheetResult = {
  asOf: string | null;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  assets: BalanceSheetLine[];
  liabilities: BalanceSheetLine[];
  equity: BalanceSheetLine[];
  trialBalance?: TrialBalanceResult;
};

export type BudgetVsActualRow = {
  account: { _id: string; code?: string; name?: string };
  budgeted: number;
  actual: number;
  variance: number;
  performance: number;
};

export type AccountingTaxRate = {
  code?: string;
  name?: string;
  rate?: number;
  kind?: string;
  account?: string | PosAccount | null;
};

export type AccountingPaymentMethodAccount = {
  methodKey?: string;
  account?: string | PosAccount | null;
};

export type AccountingConfigDoc = {
  _id?: string;
  autoPostOnPaid?: boolean;
  autoPostCogsOnPaid?: boolean;
  companyCurrency?: string;
  defaultCostMethod?: string;
  stockDeductTrigger?: string;
  kitchenFlowMode?: "station_tickets" | "kitchen_display";
  discountReasonRequired?: boolean;
  strictOversell?: boolean;
  reserveStockOnPending?: boolean;
  inventoryAlertsEnabled?: boolean;
  inventoryExpiryAlertDays?: number;
  inventoryAlertWebhookUrl?: string;
  automationWebhookEnabled?: boolean;
  automationWebhookUrl?: string;
  paymentMethodAccounts?: AccountingPaymentMethodAccount[];
  taxRates?: AccountingTaxRate[];
  branchVatRatePercent?: number;
  branchVatRates?: Array<{
    location?: string | { _id?: string; name?: string } | null;
    ratePercent?: number;
  }>;
  /** Default GL accounts */
  defaultRevenueAccount?: string | PosAccount | null;
  defaultCashAccount?: string | PosAccount | null;
  defaultCardClearingAccount?: string | PosAccount | null;
  defaultAccountsReceivableAccount?: string | PosAccount | null;
  defaultTaxPayableAccount?: string | PosAccount | null;
  defaultServiceChargePayableAccount?: string | PosAccount | null;
  retainedEarningsAccount?: string | PosAccount | null;
  serviceChargeEnabled?: boolean;
  serviceChargeRate?: number;
  /** Non-stock vendor bill lines and purchase-side operating expenses. */
  defaultPurchasesExpenseAccount?: string | PosAccount | null;
  /** Required when AR payments exceed open invoice allocations (overpayment). */
  defaultCustomerDepositAccount?: string | PosAccount | null;
  /** Maker–checker: vendor bill post requires approved `ApprovalRequest`. */
  requireApprovalsForVendorPosting?: boolean;
  /** Maker–checker: expense GL post requires approved `ApprovalRequest` in addition to document approved. */
  requireApprovalsForExpensePosting?: boolean;
};

export type AutomationRunResult = {
  recurringJournalsPosted: number;
  recurringInvoicesIssued: number;
  inventoryAlertSummary: unknown;
  automationWebhook?: { sent: boolean; reason: string };
};

/** Human-readable journal reference for UI (canonical `entryNumber` from the server). */
export function formatJournalEntryReference(entryNumber: number | undefined | null): string {
  if (entryNumber == null || !Number.isFinite(Number(entryNumber))) return "—";
  const n = Math.max(0, Math.floor(Number(entryNumber)));
  return `JE-${String(n).padStart(6, "0")}`;
}

/** Display label for register sessions (cash session sequence). */
export function formatRegisterSessionReference(sessionNumber: number | undefined | null): string {
  if (sessionNumber == null || !Number.isFinite(Number(sessionNumber))) return "—";
  const n = Math.max(0, Math.floor(Number(sessionNumber)));
  return `RS-${String(n).padStart(6, "0")}`;
}

export type AccountLedgerLine = {
  entryId: string;
  entryNumber?: number;
  entryDate: string;
  memo?: string;
  debit: number;
  credit: number;
  balance: number;
};

export type AccountLedgerResponse = {
  accountId: string;
  lines: AccountLedgerLine[];
  finalBalance: number;
};

/** @remarks With TanStack Query, use `queryFn: () => posFetchAccounts({ ... })` — not `queryFn: posFetchAccounts` (Query passes a context object as the first argument). */
export async function posFetchAccounts(params?: { type?: string; active?: "true" | "false" }): Promise<PosAccount[]> {
  const q = new URLSearchParams();
  if (params?.type) q.set("type", params.type);
  if (params?.active) q.set("active", params.active);
  const qs = q.toString();
  const path = qs ? `/api/accounting/accounts?${qs}` : "/api/accounting/accounts";
  const res = await posApiJson<PosAccount[]>(path);
  return Array.isArray(res.data) ? res.data : [];
}

export async function posCreateAccount(body: {
  code: string;
  name: string;
  type: string;
  isActive?: boolean;
  sortOrder?: number;
}): Promise<PosAccount> {
  const res = await posApiJson<PosAccount>("/api/accounting/accounts", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.data) throw new Error("No account returned");
  return res.data;
}

export async function posUpdateAccount(
  id: string,
  body: { name?: string; type?: string; isActive?: boolean; sortOrder?: number },
): Promise<PosAccount> {
  const res = await posApiJson<PosAccount>(`/api/accounting/accounts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (!res.data) throw new Error("No account returned");
  return res.data;
}

export async function posFetchAccountingConfig(): Promise<AccountingConfigDoc | null> {
  const res = await posApiJson<AccountingConfigDoc>("/api/accounting/config");
  return res.data ?? null;
}

export async function posUpdateAccountingConfig(
  body: Partial<AccountingConfigDoc>,
): Promise<AccountingConfigDoc | null> {
  const res = await posApiJson<AccountingConfigDoc>("/api/accounting/config", {
    method: "PUT",
    body: JSON.stringify(body),
  });
  return res.data ?? null;
}

export async function posRunAutomationHooks(): Promise<AutomationRunResult> {
  const res = await posApiJson<AutomationRunResult>("/api/accounting/automation/run", {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (!res.data) throw new Error(res.message || "Failed to run automation.");
  return res.data;
}

export async function posTestAutomationWebhook(): Promise<{ sent: boolean; reason: string }> {
  const res = await posApiJson<{ sent: boolean; reason: string }>("/api/accounting/automation/test-webhook", {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (!res.data) throw new Error(res.message || "Failed to test automation webhook.");
  return res.data;
}

export async function posEnsureAccountingDefaults(): Promise<void> {
  await posApiJson<void>("/api/accounting/ensure-defaults", { method: "POST", body: JSON.stringify({}) });
}

export async function posFetchAccountLedger(
  accountId: string,
  params?: { start?: string; end?: string },
): Promise<AccountLedgerResponse> {
  const q = new URLSearchParams();
  if (params?.start) q.set("start", params.start);
  if (params?.end) q.set("end", params.end);
  const qs = q.toString();
  const path = qs
    ? `/api/accounting/accounts/${accountId}/ledger?${qs}`
    : `/api/accounting/accounts/${accountId}/ledger`;
  const res = await posApiJson<AccountLedgerResponse>(path);
  if (!res.data) {
    return { accountId, lines: [], finalBalance: 0 };
  }
  return res.data;
}

export async function posFetchPnL(params?: {
  start?: string;
  end?: string;
  locationId?: string;
  costCenter?: string;
}): Promise<ProfitLossReport> {
  const q = new URLSearchParams();
  if (params?.start) q.set("start", params.start);
  if (params?.end) q.set("end", params.end);
  if (params?.locationId) q.set("locationId", params.locationId);
  if (params?.costCenter) q.set("costCenter", params.costCenter);
  const res = await posApiJson<ProfitLossReport>(`/api/accounting/reports/pnl?${q}`);
  return (
    res.data || {
      period: { start: null, end: null },
      revenue: 0,
      expense: 0,
      cogs: 0,
      netOperating: 0,
      trialBalance: { rows: [], totalDebit: 0, totalCredit: 0, balanced: true },
    }
  );
}

export async function posFetchCashFlow(params?: {
  start?: string;
  end?: string;
  locationId?: string;
  costCenter?: string;
}): Promise<CashFlowStatement> {
  const q = new URLSearchParams();
  if (params?.start) q.set("start", params.start);
  if (params?.end) q.set("end", params.end);
  if (params?.locationId) q.set("locationId", params.locationId);
  if (params?.costCenter) q.set("costCenter", params.costCenter);
  const qs = q.toString();
  const path = qs ? `/api/accounting/reports/cash-flow?${qs}` : "/api/accounting/reports/cash-flow";
  const res = await posApiJson<CashFlowStatement>(path);
  return (
    res.data || {
      period: { start: null, end: null },
      locationId: null,
      categories: { operating: 0, investing: 0, financing: 0, none: 0, netChange: 0 },
    }
  );
}

export async function posFetchBalanceSheet(params?: {
  asOf?: string;
  locationId?: string;
  costCenter?: string;
}): Promise<BalanceSheetResult | null> {
  const q = new URLSearchParams();
  if (params?.asOf) q.set("asOf", params.asOf);
  if (params?.locationId) q.set("locationId", params.locationId);
  if (params?.costCenter) q.set("costCenter", params.costCenter);
  const qs = q.toString();
  const path = qs ? `/api/accounting/reports/balance-sheet?${qs}` : "/api/accounting/reports/balance-sheet";
  const res = await posApiJson<BalanceSheetResult>(path);
  return res.data ?? null;
}

export type ConsolidationChildOrg = {
  _id: string;
  name?: string;
  slug?: string;
  lifecycle?: string;
};

export async function posListConsolidationChildOrganizations(): Promise<ConsolidationChildOrg[]> {
  const res = await posApiJson<ConsolidationChildOrg[]>(
    "/api/accounting/consolidation/child-organizations",
  );
  return Array.isArray(res.data) ? res.data : [];
}

export async function posFetchConsolidatedTrialBalance(params: {
  start?: string;
  end?: string;
  costCenter?: string;
  childOrganizationIds: string[];
}): Promise<TrialBalanceResult> {
  const q = new URLSearchParams();
  if (params.start) q.set("start", params.start);
  if (params.end) q.set("end", params.end);
  if (params.costCenter) q.set("costCenter", params.costCenter);
  q.set("childOrganizationIds", params.childOrganizationIds.join(","));
  const res = await posApiJson<TrialBalanceResult>(
    `/api/accounting/reports/consolidated/trial-balance?${q.toString()}`,
  );
  return res.data || { rows: [], totalDebit: 0, totalCredit: 0, balanced: true };
}

export async function posFetchConsolidatedPnL(params: {
  start?: string;
  end?: string;
  costCenter?: string;
  childOrganizationIds: string[];
}): Promise<ProfitLossReport> {
  const q = new URLSearchParams();
  if (params.start) q.set("start", params.start);
  if (params.end) q.set("end", params.end);
  if (params.costCenter) q.set("costCenter", params.costCenter);
  q.set("childOrganizationIds", params.childOrganizationIds.join(","));
  const res = await posApiJson<ProfitLossReport>(
    `/api/accounting/reports/consolidated/pnl?${q.toString()}`,
  );
  return (
    res.data || {
      period: { start: null, end: null },
      revenue: 0,
      expense: 0,
      cogs: 0,
      netOperating: 0,
      trialBalance: { rows: [], totalDebit: 0, totalCredit: 0, balanced: true },
    }
  );
}

export async function posFetchConsolidatedBalanceSheet(params: {
  asOf?: string;
  costCenter?: string;
  childOrganizationIds: string[];
}): Promise<BalanceSheetResult | null> {
  const q = new URLSearchParams();
  if (params.asOf) q.set("asOf", params.asOf);
  if (params.costCenter) q.set("costCenter", params.costCenter);
  q.set("childOrganizationIds", params.childOrganizationIds.join(","));
  const res = await posApiJson<BalanceSheetResult>(
    `/api/accounting/reports/consolidated/balance-sheet?${q.toString()}`,
  );
  return res.data ?? null;
}

export type ExpenseReportLine = {
  _id?: string;
  description: string;
  amount: number;
  glAccount: string | PosAccount;
  attachmentUrl?: string;
};

export type ExpenseReportDoc = {
  _id: string;
  expenseNumber: string;
  status: "draft" | "submitted" | "approved" | "rejected" | "posted";
  currency?: string;
  lines: ExpenseReportLine[];
  total: number;
  notes?: string;
  journalEntry?: string | null;
  createdAt?: string;
};

export async function posListExpenseReports(): Promise<ExpenseReportDoc[]> {
  const res = await posApiJson<ExpenseReportDoc[]>("/api/accounting/expense-reports");
  return Array.isArray(res.data) ? res.data : [];
}

export async function posGetExpenseReport(id: string): Promise<ExpenseReportDoc | null> {
  const res = await posApiJson<ExpenseReportDoc>(`/api/accounting/expense-reports/${id}`);
  return res.data ?? null;
}

export async function posCreateExpenseReport(body: {
  lines: Array<{ description: string; amount: number; glAccount: string; attachmentUrl?: string }>;
  notes?: string;
  currency?: string;
}): Promise<ExpenseReportDoc> {
  const res = await posApiJson<ExpenseReportDoc>("/api/accounting/expense-reports", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.data) throw new Error(res.message || "Create failed");
  return res.data;
}

export async function posUpdateExpenseReport(
  id: string,
  body: {
    lines?: Array<{ description: string; amount: number; glAccount: string; attachmentUrl?: string }>;
    notes?: string;
    currency?: string;
  },
): Promise<ExpenseReportDoc> {
  const res = await posApiJson<ExpenseReportDoc>(`/api/accounting/expense-reports/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (!res.data) throw new Error(res.message || "Update failed");
  return res.data;
}

export async function posSubmitExpenseReport(id: string): Promise<ExpenseReportDoc> {
  const res = await posApiJson<ExpenseReportDoc>(`/api/accounting/expense-reports/${id}/submit`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (!res.data) throw new Error(res.message || "Submit failed");
  return res.data;
}

export async function posApproveExpenseReportDirect(id: string): Promise<ExpenseReportDoc> {
  const res = await posApiJson<ExpenseReportDoc>(`/api/accounting/expense-reports/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (!res.data) throw new Error(res.message || "Approve failed");
  return res.data;
}

export async function posRejectExpenseReportDirect(id: string, reason?: string): Promise<ExpenseReportDoc> {
  const res = await posApiJson<ExpenseReportDoc>(`/api/accounting/expense-reports/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason: reason ?? "" }),
  });
  if (!res.data) throw new Error(res.message || "Reject failed");
  return res.data;
}

export async function posPostExpenseReportGl(id: string): Promise<unknown> {
  const res = await posApiJson<unknown>(`/api/accounting/expense-reports/${id}/post-gl`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (!res.data) throw new Error(res.message || "Post failed");
  return res.data;
}

export type ApprovalRequestDoc = {
  _id: string;
  targetType: string;
  targetId: string;
  /** Human-readable title from the linked document (server-enriched). */
  targetSummary?: string;
  /** In-app path to open the target, when the document exists. */
  targetDetailPath?: string | null;
  status: "pending" | "approved" | "rejected";
  notes?: string;
  createdAt?: string;
};

export async function posListApprovalRequests(params?: {
  status?: string;
  targetType?: string;
}): Promise<ApprovalRequestDoc[]> {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  if (params?.targetType) q.set("targetType", params.targetType);
  const qs = q.toString();
  const path = qs ? `/api/accounting/approval-requests?${qs}` : "/api/accounting/approval-requests";
  const res = await posApiJson<ApprovalRequestDoc[]>(path);
  return Array.isArray(res.data) ? res.data : [];
}

export async function posCreateApprovalRequest(body: {
  targetType: string;
  targetId: string;
  notes?: string;
}): Promise<ApprovalRequestDoc> {
  const res = await posApiJson<ApprovalRequestDoc>("/api/accounting/approval-requests", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.data) throw new Error(res.message || "Create failed");
  return res.data;
}

export async function posApproveApprovalRequest(id: string): Promise<ApprovalRequestDoc> {
  const res = await posApiJson<ApprovalRequestDoc>(`/api/accounting/approval-requests/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (!res.data) throw new Error(res.message || "Approve failed");
  return res.data;
}

export async function posRejectApprovalRequest(id: string, reason?: string): Promise<ApprovalRequestDoc> {
  const res = await posApiJson<ApprovalRequestDoc>(`/api/accounting/approval-requests/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason: reason ?? "" }),
  });
  if (!res.data) throw new Error(res.message || "Reject failed");
  return res.data;
}

export async function posFetchBudgetVsActual(params: {
  fiscalYear: number;
  periodMonth: number;
}): Promise<BudgetVsActualRow[]> {
  const q = new URLSearchParams();
  q.set("fiscalYear", String(params.fiscalYear));
  q.set("periodMonth", String(params.periodMonth));
  const res = await posApiJson<BudgetVsActualRow[]>(`/api/accounting/reports/budget-vs-actual?${q}`);
  return Array.isArray(res.data) ? res.data : [];
}

/** `GET/POST/DELETE /api/accounting/budgets` — GL read / write; one row per org + fiscal year + month + account. */
export type AccountingBudgetDoc = {
  _id: string;
  accountId: string | { _id: string; code?: string; name?: string };
  fiscalYear: number;
  periodMonth: number;
  budgetedAmount: number;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
};

export async function posFetchAccountingBudgets(params?: { year?: number }): Promise<AccountingBudgetDoc[]> {
  const q = new URLSearchParams();
  if (params?.year != null) q.set("year", String(params.year));
  const qs = q.toString();
  const path = qs ? `/api/accounting/budgets?${qs}` : "/api/accounting/budgets";
  const res = await posApiJson<AccountingBudgetDoc[]>(path);
  return Array.isArray(res.data) ? res.data : [];
}

export async function posCreateAccountingBudget(body: {
  accountId: string;
  fiscalYear: number;
  periodMonth: number;
  budgetedAmount: number;
  notes?: string;
}): Promise<AccountingBudgetDoc> {
  const res = await posApiJson<AccountingBudgetDoc>("/api/accounting/budgets", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.data) throw new Error(res.message || "Failed to create budget");
  return res.data;
}

export async function posDeleteAccountingBudget(id: string): Promise<void> {
  const res = await posApiFetch(`/api/accounting/budgets/${id}`, { method: "DELETE" });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = (await res.json()) as { message?: string };
      if (typeof j.message === "string") msg = j.message;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
}

/** `PATCH /api/accounting/budgets/:id` — GL write; returns 409 if target period is locked. */
export async function posUpdateAccountingBudget(
  id: string,
  body: Partial<{
    accountId: string;
    fiscalYear: number;
    periodMonth: number;
    budgetedAmount: number;
    notes: string;
    status: string;
  }>,
): Promise<AccountingBudgetDoc> {
  const res = await posApiJson<AccountingBudgetDoc>(`/api/accounting/budgets/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (!res.data) throw new Error(res.message || "Failed to update budget");
  return res.data;
}

/** `GET/POST/PATCH/DELETE /api/accounting/recurring-templates` — GL read/write; worker posts balanced journals on schedule. */
export type RecurringJournalFrequency = "daily" | "weekly" | "monthly";

export type RecurringJournalTemplateLineDoc = {
  account: string | { _id: string; code?: string; name?: string };
  debit?: number;
  credit?: number;
  memo?: string;
};

export type RecurringJournalTemplateDoc = {
  _id: string;
  memo: string;
  frequency: RecurringJournalFrequency;
  nextRunAt: string;
  lastRunAt?: string | null;
  isActive: boolean;
  templateLines: RecurringJournalTemplateLineDoc[];
  createdAt?: string;
  updatedAt?: string;
};

export async function posFetchRecurringJournalTemplates(): Promise<RecurringJournalTemplateDoc[]> {
  const res = await posApiJson<RecurringJournalTemplateDoc[]>("/api/accounting/recurring-templates");
  return Array.isArray(res.data) ? res.data : [];
}

export async function posCreateRecurringJournalTemplate(body: {
  memo: string;
  frequency: RecurringJournalFrequency;
  nextRunAt?: string;
  isActive?: boolean;
  templateLines: Array<{ account: string; debit: number; credit: number; memo?: string }>;
}): Promise<RecurringJournalTemplateDoc> {
  const res = await posApiJson<RecurringJournalTemplateDoc>("/api/accounting/recurring-templates", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.data) throw new Error(res.message || "Failed to create template");
  return res.data;
}

export async function posUpdateRecurringJournalTemplate(
  id: string,
  body: Partial<{
    memo: string;
    frequency: RecurringJournalFrequency;
    nextRunAt: string;
    isActive: boolean;
    templateLines: Array<{ account: string; debit: number; credit: number; memo?: string }>;
  }>,
): Promise<RecurringJournalTemplateDoc | null> {
  const res = await posApiJson<RecurringJournalTemplateDoc>(`/api/accounting/recurring-templates/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  return res.data ?? null;
}

export async function posDeleteRecurringJournalTemplate(id: string): Promise<void> {
  const res = await posApiFetch(`/api/accounting/recurring-templates/${id}`, { method: "DELETE" });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = (await res.json()) as { message?: string };
      if (typeof j.message === "string") msg = j.message;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
}

export type RecurringJournalRunResult = {
  entry: { _id: string; entryNumber?: number; entryDate?: string; memo?: string };
  reused: boolean;
  template: RecurringJournalTemplateDoc;
};

/** `POST /api/accounting/recurring-templates/:id/run` — requires GL write; returns 409 if target period is locked. */
export async function posRunRecurringJournalTemplate(id: string): Promise<RecurringJournalRunResult> {
  const res = await posApiJson<RecurringJournalRunResult>(`/api/accounting/recurring-templates/${id}/run`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (!res.data) throw new Error(res.message || "Failed to run recurring template");
  return res.data;
}

/** `GET/POST/DELETE /api/accounting/recurring-invoices` — AR read/write. */
export type RecurringInvoiceFrequency = "daily" | "weekly" | "monthly";

export type RecurringInvoiceLineDoc = {
  description: string;
  quantity: number;
  unitPrice: number;
  taxCode?: string | null;
};

export type RecurringInvoiceTemplateDoc = {
  _id: string;
  customer: string | { _id: string; name?: string; email?: string; vatNumber?: string; phone?: string; isBillingCustomer?: boolean };
  frequency: RecurringInvoiceFrequency;
  startAt?: string | null;
  endAt?: string | null;
  nextIssueAt: string;
  lastIssuedAt?: string | null;
  status?: "active" | "paused" | "completed" | "expired";
  isActive: boolean;
  timezone?: string;
  dueDays?: number;
  currency?: string;
  templateLinesCount?: number;
  templateLines?: RecurringInvoiceLineDoc[];
  notes?: string;
  runLogs?: Array<{
    runAt: string;
    status: "success" | "failed" | "skipped";
    trigger: "worker" | "manual";
    invoiceId?: string | null;
    invoiceNumber?: string;
    message?: string;
  }>;
  createdAt?: string;
  updatedAt?: string;
};

export async function posFetchRecurringInvoiceTemplates(): Promise<RecurringInvoiceTemplateDoc[]> {
  const res = await posApiJson<RecurringInvoiceTemplateDoc[]>("/api/accounting/recurring-invoices");
  return Array.isArray(res.data) ? res.data : [];
}

export async function posCreateRecurringInvoiceTemplate(body: {
  customer: string;
  frequency: RecurringInvoiceFrequency;
  startAt?: string | null;
  endAt?: string | null;
  nextIssueAt?: string;
  isActive?: boolean;
  status?: "active" | "paused" | "completed" | "expired";
  timezone?: string;
  dueDays?: number;
  currency?: string;
  templateLines: RecurringInvoiceLineDoc[];
  notes?: string;
}): Promise<RecurringInvoiceTemplateDoc> {
  const res = await posApiJson<RecurringInvoiceTemplateDoc>("/api/accounting/recurring-invoices", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.data) throw new Error(res.message || "Failed to create recurring invoice template");
  return res.data;
}

export async function posUpdateRecurringInvoiceTemplate(
  id: string,
  body: Partial<{
    customer: string;
    frequency: RecurringInvoiceFrequency;
    startAt: string | null;
    endAt: string | null;
    nextIssueAt: string;
    isActive: boolean;
    status: "active" | "paused" | "completed" | "expired";
    timezone: string;
    dueDays: number;
    currency: string;
    templateLines: RecurringInvoiceLineDoc[];
    notes: string;
  }>,
): Promise<RecurringInvoiceTemplateDoc> {
  const res = await posApiJson<RecurringInvoiceTemplateDoc>(`/api/accounting/recurring-invoices/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (!res.data) throw new Error(res.message || "Failed to update recurring invoice template");
  return res.data;
}

export async function posDeleteRecurringInvoiceTemplate(id: string): Promise<void> {
  const res = await posApiFetch(`/api/accounting/recurring-invoices/${id}`, { method: "DELETE" });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = (await res.json()) as { message?: string };
      if (typeof j.message === "string") msg = j.message;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
}

export type RecurringInvoiceRunResult = {
  invoice: {
    _id: string;
    invoiceNumber: string;
    issueDate?: string;
    dueDate?: string;
    total: number;
  };
  template: RecurringInvoiceTemplateDoc;
};

export type RecurringInvoicePreviewResult = {
  frequency: RecurringInvoiceFrequency;
  dueDays: number;
  timezone: string;
  count: number;
  runs: Array<{
    issueDate: string;
    dueDate: string;
    subtotal: number;
    tax: number;
    total: number;
    currency: string;
    timezone: string;
  }>;
};

export type BackofficeNotificationSeverity = "info" | "warning" | "critical";

export type BackofficeNotificationDoc = {
  _id: string;
  type: string;
  title: string;
  body: string;
  severity: BackofficeNotificationSeverity;
  sourceType: string;
  sourceId: string;
  href: string;
  metadata: Record<string, unknown>;
  isArchived: boolean;
  isRead: boolean;
  createdAt?: string;
  updatedAt?: string;
};

/** `POST /api/accounting/recurring-invoices/:id/run` — requires AR write; returns 409 if target period is locked. */
export async function posRunRecurringInvoiceTemplate(id: string): Promise<RecurringInvoiceRunResult> {
  const res = await posApiJson<RecurringInvoiceRunResult>(`/api/accounting/recurring-invoices/${id}/run`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (!res.data) throw new Error(res.message || "Failed to run recurring invoice");
  return res.data;
}

export async function posPreviewRecurringInvoiceTemplate(body: {
  customer: string;
  frequency: RecurringInvoiceFrequency;
  startAt?: string | null;
  endAt?: string | null;
  nextIssueAt?: string;
  dueDays?: number;
  timezone?: string;
  currency?: string;
  templateLines: RecurringInvoiceLineDoc[];
  count?: number;
}): Promise<RecurringInvoicePreviewResult> {
  const res = await posApiJson<RecurringInvoicePreviewResult>("/api/accounting/recurring-invoices/preview", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.data) throw new Error(res.message || "Failed to preview recurring invoice schedule");
  return res.data;
}

export async function posFetchBackofficeNotifications(params?: {
  status?: "all" | "unread" | "read";
  severity?: BackofficeNotificationSeverity | "all";
  limit?: number;
}): Promise<BackofficeNotificationDoc[]> {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.severity) query.set("severity", params.severity);
  if (params?.limit && Number.isFinite(params.limit)) query.set("limit", String(params.limit));
  const qs = query.toString();
  const path = qs ? `/api/accounting/notifications?${qs}` : "/api/accounting/notifications";
  const res = await posApiJson<BackofficeNotificationDoc[]>(path);
  return Array.isArray(res.data) ? res.data : [];
}

export async function posFetchBackofficeUnreadNotificationCount(): Promise<number> {
  const res = await posApiJson<{ unreadCount?: number }>("/api/accounting/notifications/unread-count");
  return Number(res.data?.unreadCount || 0);
}

export async function posMarkBackofficeNotificationRead(
  id: string,
): Promise<BackofficeNotificationDoc> {
  const res = await posApiJson<BackofficeNotificationDoc>(`/api/accounting/notifications/${id}/read`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (!res.data) throw new Error(res.message || "Failed to mark notification as read");
  return res.data;
}

export async function posMarkAllBackofficeNotificationsRead(): Promise<{ modifiedCount: number }> {
  const res = await posApiJson<{ modifiedCount: number }>("/api/accounting/notifications/all/read", {
    method: "POST",
    body: JSON.stringify({}),
  });
  return { modifiedCount: Number(res.data?.modifiedCount || 0) };
}

/** `GET/POST/PATCH/DELETE /api/accounting/fx/rates`, `GET /fx/resolve` — accounting read/write. */
export type FxRateDoc = {
  _id: string;
  effectiveDate: string;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  note?: string;
  createdAt?: string;
  updatedAt?: string;
};

export async function posFetchFxRates(params?: { from?: string; to?: string }): Promise<FxRateDoc[]> {
  const q = new URLSearchParams();
  if (params?.from?.trim()) q.set("from", params.from.trim().toUpperCase());
  if (params?.to?.trim()) q.set("to", params.to.trim().toUpperCase());
  const qs = q.toString();
  const path = qs ? `/api/accounting/fx/rates?${qs}` : "/api/accounting/fx/rates";
  const res = await posApiJson<FxRateDoc[]>(path);
  return Array.isArray(res.data) ? res.data : [];
}

export async function posCreateFxRate(body: {
  effectiveDate?: string;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  note?: string;
}): Promise<FxRateDoc> {
  const res = await posApiJson<FxRateDoc>("/api/accounting/fx/rates", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.data) throw new Error(res.message || "Failed to create FX rate");
  return res.data;
}

export async function posUpdateFxRate(
  id: string,
  body: {
    effectiveDate?: string;
    fromCurrency: string;
    toCurrency: string;
    rate: number;
    note?: string;
  },
): Promise<FxRateDoc> {
  const res = await posApiJson<FxRateDoc>(`/api/accounting/fx/rates/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (!res.data) throw new Error(res.message || "Failed to update FX rate");
  return res.data;
}

export async function posDeleteFxRate(id: string): Promise<void> {
  const res = await posApiFetch(`/api/accounting/fx/rates/${id}`, { method: "DELETE" });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = (await res.json()) as { message?: string };
      if (typeof j.message === "string") msg = j.message;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
}

export async function posResolveFx(params: {
  from: string;
  to: string;
  date?: string;
}): Promise<{ from: string; to: string; rate: number; date: string }> {
  const q = new URLSearchParams();
  q.set("from", params.from.trim().toUpperCase());
  q.set("to", params.to.trim().toUpperCase());
  if (params.date?.trim()) q.set("date", params.date.trim());
  const res = await posApiJson<{ from: string; to: string; rate: number | null; date: string }>(
    `/api/accounting/fx/resolve?${q}`,
  );
  if (res.data == null) throw new Error(res.message || "Could not resolve rate");
  const rate = res.data.rate;
  if (rate == null || !Number.isFinite(Number(rate)) || Number(rate) <= 0) {
    throw new Error(
      res.message ||
        "No FX rate in your table for this pair on or before the selected date. Add a rate first.",
    );
  }
  return { ...res.data, rate: Number(rate) };
}

/** `GET /api/accounting/invoices` — AR invoices (requires `backoffice.accounting.ar.read`). */
export type AccountingInvoiceDoc = {
  _id: string;
  invoiceNumber: string;
  customer?: { _id?: string; name?: string; phone?: string } | string | null;
  order?: { _id?: string; orderStatus?: string } | string | null;
  status: string;
  issueDate?: string;
  dueDate?: string;
  currency?: string;
  subtotal?: number;
  tax?: number;
  serviceCharge?: number;
  total: number;
  amountPaid?: number;
  taxDetails?: Array<{ code?: string; label?: string; amount?: number }>;
};

export async function posFetchInvoices(params?: {
  status?: string;
  customerId?: string;
  limit?: number;
}): Promise<AccountingInvoiceDoc[]> {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  if (params?.customerId) q.set("customerId", params.customerId);
  if (params?.limit != null) q.set("limit", String(params.limit));
  const qs = q.toString();
  const path = qs ? `/api/accounting/invoices?${qs}` : "/api/accounting/invoices";
  const res = await posApiJson<AccountingInvoiceDoc[]>(path);
  return Array.isArray(res.data) ? res.data : [];
}

export async function posCreateInvoiceFromOrder(
  orderId: string,
  body?: { dueDays?: number },
): Promise<AccountingInvoiceDoc> {
  const res = await posApiJson<AccountingInvoiceDoc>(`/api/accounting/invoices/from-order/${orderId}`, {
    method: "POST",
    body: JSON.stringify({ dueDays: body?.dueDays ?? 30 }),
  });
  if (!res.data) throw new Error(res.message || "No invoice returned");
  return res.data;
}

export async function posVoidInvoice(invoiceId: string): Promise<AccountingInvoiceDoc> {
  const res = await posApiJson<AccountingInvoiceDoc>(`/api/accounting/invoices/${invoiceId}/void`, {
    method: "PATCH",
    body: JSON.stringify({}),
  });
  if (!res.data) throw new Error(res.message || "Void failed");
  return res.data;
}

export type ArAgingReport = {
  asOf: string;
  buckets: {
    current: number;
    days1to30: number;
    days31to60: number;
    days61to90: number;
    over90: number;
  };
  invoices: Array<{
    invoiceId: string;
    invoiceNumber: string;
    customerId?: string;
    customerName?: string;
    dueDate: string;
    amountDue: number;
    daysPastDue: number;
  }>;
};

export async function posFetchArAging(params?: { asOf?: string }): Promise<ArAgingReport | null> {
  const q = new URLSearchParams();
  if (params?.asOf) q.set("asOf", params.asOf);
  const qs = q.toString();
  const path = qs ? `/api/accounting/reports/ar-aging?${qs}` : "/api/accounting/reports/ar-aging";
  const res = await posApiJson<ArAgingReport>(path);
  return res.data ?? null;
}

export type CustomerStatementDoc = {
  asOf: string;
  currency: string;
  customer: {
    id: string;
    name: string;
    email: string;
    phone: string;
    arBalance: number;
    unappliedCredit: number;
  };
  openInvoices: Array<{
    invoiceId: string;
    invoiceNumber: string;
    issueDate: string;
    dueDate: string;
    status: string;
    total: number;
    amountPaid: number;
    amountDue: number;
  }>;
  totalOpenAmount: number;
  invoices: Array<{
    invoiceId: string;
    invoiceNumber: string;
    status: string;
    issueDate: string;
    dueDate: string;
    subtotal: number;
    tax: number;
    total: number;
    amountPaid: number;
    amountDue: number;
  }>;
};

export async function posFetchCustomerStatement(params: {
  customerId: string;
  start?: string;
  end?: string;
}): Promise<CustomerStatementDoc | null> {
  const q = new URLSearchParams();
  q.set("customerId", params.customerId);
  if (params.start) q.set("start", params.start);
  if (params.end) q.set("end", params.end);
  const res = await posApiJson<CustomerStatementDoc>(
    `/api/accounting/reports/customer-statement?${q.toString()}`,
  );
  return res.data ?? null;
}

export async function posDownloadCustomerStatementPdf(params: {
  customerId: string;
  start?: string;
  end?: string;
}): Promise<{ blob: Blob; filename: string }> {
  const q = new URLSearchParams();
  q.set("customerId", params.customerId);
  if (params.start) q.set("start", params.start);
  if (params.end) q.set("end", params.end);
  return posDownloadAccountingExport(`/api/accounting/reports/customer-statement.pdf?${q.toString()}`);
}

export type SupplierStatementDoc = {
  asOf: string;
  currency: string;
  supplier: {
    id: string;
    name: string;
    code: string;
    email: string;
    phone: string;
  };
  openBills: Array<{
    vendorBillId: string;
    vendorBillNumber: string;
    billDate: string;
    dueDate: string;
    status: string;
    total: number;
    amountPaid: number;
    amountDue: number;
  }>;
  totalOpenAmount: number;
  bills: Array<{
    vendorBillId: string;
    vendorBillNumber: string;
    status: string;
    billDate: string;
    dueDate: string;
    subtotal: number;
    tax: number;
    total: number;
    amountPaid: number;
    amountDue: number;
  }>;
};

export async function posFetchSupplierStatement(params: {
  supplierId: string;
  start?: string;
  end?: string;
}): Promise<SupplierStatementDoc | null> {
  const q = new URLSearchParams();
  q.set("supplierId", params.supplierId);
  if (params.start) q.set("start", params.start);
  if (params.end) q.set("end", params.end);
  const res = await posApiJson<SupplierStatementDoc>(
    `/api/accounting/reports/supplier-statement?${q.toString()}`,
  );
  return res.data ?? null;
}

export async function posDownloadSupplierStatementPdf(params: {
  supplierId: string;
  start?: string;
  end?: string;
}): Promise<{ blob: Blob; filename: string }> {
  const q = new URLSearchParams();
  q.set("supplierId", params.supplierId);
  if (params.start) q.set("start", params.start);
  if (params.end) q.set("end", params.end);
  return posDownloadAccountingExport(`/api/accounting/reports/supplier-statement.pdf?${q.toString()}`);
}

export type CreditNoteDoc = {
  _id: string;
  creditNoteNumber: string;
  customer?: { _id?: string; name?: string; code?: string } | string;
  invoice?: { _id?: string; invoiceNumber?: string } | string;
  status: string;
  issueDate?: string;
  currency?: string;
  subtotal?: number;
  tax?: number;
  serviceCharge?: number;
  total: number;
  reason?: string;
  notes?: string;
};

export async function posFetchCreditNotes(params?: {
  customerId?: string;
  invoiceId?: string;
}): Promise<CreditNoteDoc[]> {
  const q = new URLSearchParams();
  if (params?.customerId) q.set("customerId", params.customerId);
  if (params?.invoiceId) q.set("invoiceId", params.invoiceId);
  const qs = q.toString();
  const path = qs ? `/api/accounting/credit-notes?${qs}` : "/api/accounting/credit-notes";
  const res = await posApiJson<CreditNoteDoc[]>(path);
  return Array.isArray(res.data) ? res.data : [];
}

export async function posGetCreditNote(id: string): Promise<CreditNoteDoc | null> {
  const res = await posApiJson<CreditNoteDoc>(`/api/accounting/credit-notes/${id}`);
  return res.data ?? null;
}

export async function posIssueCreditNote(body: {
  invoiceId: string;
  amount?: number;
  reason?: string;
  issueDate?: string;
  notes?: string;
}): Promise<CreditNoteDoc> {
  const res = await posApiJson<CreditNoteDoc>("/api/accounting/credit-notes", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.data) throw new Error(res.message || "Credit note failed");
  return res.data;
}

/** `GET /api/accounting/vendor-bills` — AP vendor bills (`backoffice.accounting.ap.read`). */
export type VendorBillLineDoc = {
  _id?: string;
  itemDescription: string;
  ingredient?: string | { _id?: string; name?: string; sku?: string };
  quantity: number;
  unitPrice: number;
  taxAmount?: number;
  lineTotal: number;
};

export type VendorBillDoc = {
  _id: string;
  vendorBillNumber: string;
  supplier?: { _id?: string; name?: string; code?: string } | string;
  purchaseOrder?: { _id?: string; reference?: string } | string | null;
  status: string;
  billDate?: string;
  dueDate?: string;
  currency?: string;
  subtotal?: number;
  tax?: number;
  total: number;
  amountPaid?: number;
  notes?: string;
  lines?: VendorBillLineDoc[];
};

export async function posFetchVendorBills(params?: { status?: string; supplierId?: string }): Promise<VendorBillDoc[]> {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  if (params?.supplierId) q.set("supplierId", params.supplierId);
  const qs = q.toString();
  const path = qs ? `/api/accounting/vendor-bills?${qs}` : "/api/accounting/vendor-bills";
  const res = await posApiJson<VendorBillDoc[]>(path);
  return Array.isArray(res.data) ? res.data : [];
}

export async function posGetVendorBill(id: string): Promise<VendorBillDoc | null> {
  const res = await posApiJson<VendorBillDoc>(`/api/accounting/vendor-bills/${id}`);
  return res.data ?? null;
}

export async function posCreateVendorBillFromPO(body: {
  purchaseOrderId: string;
  billDate?: string;
  dueDate?: string;
  currency?: string;
}): Promise<VendorBillDoc> {
  const res = await posApiJson<VendorBillDoc>("/api/accounting/vendor-bills/from-po", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.data) throw new Error(res.message || "Failed to create vendor bill");
  return res.data;
}

export async function posPostVendorBill(id: string): Promise<VendorBillDoc> {
  const res = await posApiJson<VendorBillDoc>(`/api/accounting/vendor-bills/${id}/post`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (!res.data) throw new Error(res.message || "Post failed");
  return res.data;
}

export async function posRecordVendorBillPayment(
  id: string,
  body: { amount: number; method?: string; date?: string },
): Promise<VendorBillDoc> {
  const res = await posApiJson<VendorBillDoc>(`/api/accounting/vendor-bills/${id}/payments`, {
    method: "POST",
    body: JSON.stringify({
      amount: body.amount,
      method: body.method,
      date: body.date,
    }),
  });
  if (!res.data) throw new Error(res.message || "Payment failed");
  return res.data;
}

export async function posVoidVendorBill(id: string): Promise<VendorBillDoc> {
  const res = await posApiJson<VendorBillDoc>(`/api/accounting/vendor-bills/${id}/void`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (!res.data) throw new Error(res.message || "Void failed");
  return res.data;
}

export async function posFetchTrialBalance(params?: {
  start?: string;
  end?: string;
  locationId?: string;
  costCenter?: string;
}): Promise<TrialBalanceResult> {
  const q = new URLSearchParams();
  if (params?.start) q.set("start", params.start);
  if (params?.end) q.set("end", params.end);
  if (params?.locationId) q.set("locationId", params.locationId);
  if (params?.costCenter) q.set("costCenter", params.costCenter);
  const qs = q.toString();
  const path = qs ? `/api/accounting/trial-balance?${qs}` : "/api/accounting/trial-balance";
  const res = await posApiJson<TrialBalanceResult>(path);
  return res.data || { rows: [], totalDebit: 0, totalCredit: 0, balanced: true };
}

/** Populated `lines.account` is `{ _id, code, name, type }` when returned from API. */
export type JournalLineDoc = {
  _id?: string;
  account: string | { _id: string; code?: string; name?: string; type?: string };
  debit: number;
  credit: number;
  memo?: string;
};

export type JournalEntryDoc = {
  _id: string;
  entryNumber: number;
  entryDate: string;
  memo?: string;
  sourceType: string;
  sourceId?: string | null;
  lines: JournalLineDoc[];
};

/** `GET /api/accounting/sessions` — cash register sessions (`backoffice.accounting.read`). */
export type AccountingSessionDoc = {
  _id: string;
  sessionNumber: number;
  status: "open" | "closed";
  openedAt: string;
  closedAt?: string | null;
  openingFloat?: number;
  /** Cash Reconciliation */
  closingCountedCash?: number | null;
  expectedCash?: number | null;
  discrepancy?: number | null;
  /** Card Reconciliation */
  closingCountedCard?: number | null;
  expectedCard?: number | null;
  discrepancyCard?: number | null;
  /** Metadata */
  discrepancyNote?: string;
  /** Snapshots written on each close (counted vs expected, variance, note). */
  cashReconciliationLog?: ReadonlyArray<{
    readonly at?: string;
    readonly actor?: string | { _id: string; name?: string } | null;
    readonly countedCash?: number | null;
    readonly expectedCash?: number | null;
    readonly variance?: number | null;
    readonly note?: string;
  }>;
  openedBy?: { _id: string; name?: string; email?: string } | string | null;
  closedBy?: { _id: string; name?: string; email?: string } | string | null;
  location?: string | { _id: string; name?: string } | null;
  closeJournalEntry?: string | null;
};

/** `GET /api/accounting/periods` — fiscal periods (`backoffice.accounting.read`). */
export type AccountingPeriodDoc = {
  _id: string;
  year: number;
  month: number;
  status: "open" | "closed";
  closedAt?: string | null;
  closedBy?: unknown;
};

export type SessionSummaryReport = {
  session: AccountingSessionDoc;
  journalEntries: JournalEntryDoc[];
  /** Aggregate Totals for Reconciliation */
  aggregates?: {
    totalSales: number;
    totalCash: number;
    totalCard: number;
    totalAr: number;
    totalTax: number;
  };
};

export type AccountingSessionsListResult = {
  sessions: AccountingSessionDoc[];
  page: number;
  limit: number;
  total: number;
};

export async function posFetchAccountingSessions(params?: {
  page?: number;
  limit?: number;
  status?: "open" | "closed" | "all";
  sortBy?: "openedAt" | "sessionNumber" | "status" | "openingFloat";
  sortDir?: "asc" | "desc";
}): Promise<AccountingSessionsListResult> {
  const q = new URLSearchParams();
  if (params?.page != null) q.set("page", String(params.page));
  if (params?.limit != null) q.set("limit", String(params.limit));
  if (params?.status && params.status !== "all") q.set("status", params.status);
  if (params?.sortBy) q.set("sortBy", params.sortBy);
  if (params?.sortDir) q.set("sortDir", params.sortDir);
  const qs = q.toString();
  const path = qs ? `/api/accounting/sessions?${qs}` : "/api/accounting/sessions";
  const res = await posApiFetch(path);
  let body: {
    success?: boolean;
    data?: AccountingSessionDoc[];
    page?: number;
    limit?: number;
    total?: number;
    message?: string;
  };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    body = {};
  }
  if (!res.ok) {
    throw new Error(
      (typeof body.message === "string" && body.message) || res.statusText || `Request failed (${res.status})`,
    );
  }
  const sessions = Array.isArray(body.data) ? body.data : [];
  const page = body.page;
  const limit = body.limit;
  const total = body.total;
  if (typeof page === "number" && typeof limit === "number" && typeof total === "number") {
    return { sessions, page, limit, total };
  }
  return { sessions, page: 1, limit: Math.max(1, sessions.length), total: sessions.length };
}

export async function posOpenAccountingSession(body: {
  openingFloat?: number;
  location?: string | null;
}): Promise<AccountingSessionDoc> {
  const res = await posApiJson<AccountingSessionDoc>("/api/accounting/sessions/open", {
    method: "POST",
    body: JSON.stringify({
      openingFloat: body.openingFloat ?? 0,
      location: body.location || undefined,
    }),
  });
  if (!res.data) throw new Error(res.message || "Failed to open session");
  return res.data;
}

export async function posCloseAccountingSession(
  sessionId: string,
  body: {
    closingCountedCash: number;
    closingCountedCard?: number | null;
    expectedCash?: number | null;
    expectedCard?: number | null;
    discrepancyNote?: string;
    partialCashCounted?: number | null;
  },
): Promise<{ session: AccountingSessionDoc; journalEntry: JournalEntryDoc | null }> {
  const res = await posApiJson<{ session: AccountingSessionDoc; journalEntry: JournalEntryDoc | null }>(
    `/api/accounting/sessions/${sessionId}/close`,
    {
      method: "POST",
      body: JSON.stringify({
        closingCountedCash: body.closingCountedCash,
        closingCountedCard: body.closingCountedCard,
        expectedCash: body.expectedCash,
        expectedCard: body.expectedCard,
        discrepancyNote: body.discrepancyNote,
        partialCashCounted: body.partialCashCounted,
      }),
    },
  );
  if (!res.data?.session) throw new Error(res.message || "Failed to close session");
  return res.data;
}

export async function posFetchSessionSummary(sessionId: string): Promise<SessionSummaryReport | null> {
  const q = new URLSearchParams({ sessionId });
  const res = await posApiJson<SessionSummaryReport>(`/api/accounting/reports/session-summary?${q}`);
  return res.data ?? null;
}

export async function posFetchAccountingPeriods(): Promise<AccountingPeriodDoc[]> {
  const res = await posApiJson<AccountingPeriodDoc[]>("/api/accounting/periods");
  return Array.isArray(res.data) ? res.data : [];
}

export async function posCloseAccountingPeriod(body: { year: number; month: number }): Promise<AccountingPeriodDoc> {
  const res = await posApiJson<AccountingPeriodDoc>("/api/accounting/periods/close", {
    method: "POST",
    body: JSON.stringify({ year: body.year, month: body.month }),
  });
  if (!res.data) throw new Error(res.message || "Failed to close period");
  return res.data;
}

/**
 * `POST /api/accounting/closing/retained-earnings` — `backoffice.accounting.periods.write`.
 * Returns created journal entry or null when nothing to close.
 */
export async function posPostRetainedEarningsClosing(body: {
  endDate?: string;
  idempotencyKey?: string;
}): Promise<{ entry: JournalEntryDoc | null; message?: string }> {
  const headers: HeadersInit = {};
  if (body.idempotencyKey) headers["Idempotency-Key"] = body.idempotencyKey;
  const res = await posApiFetch("/api/accounting/closing/retained-earnings", {
    method: "POST",
    headers,
    body: JSON.stringify({
      endDate: body.endDate,
      idempotencyKey: body.idempotencyKey,
    }),
  });
  let payload: { success?: boolean; message?: string; data?: JournalEntryDoc | null };
  try {
    payload = (await res.json()) as typeof payload;
  } catch {
    payload = {};
  }
  if (!res.ok) {
    throw new Error(
      (typeof payload?.message === "string" && payload.message) || res.statusText || `Request failed (${res.status})`,
    );
  }
  return { entry: payload.data ?? null, message: typeof payload.message === "string" ? payload.message : undefined };
}

export async function posListJournalEntries(params: {
  page?: number;
  limit?: number;
  sourceType?: string;
  orderId?: string;
  memo?: string;
  start?: string;
  end?: string;
}): Promise<{ entries: JournalEntryDoc[]; page: number; limit: number; total: number }> {
  const q = new URLSearchParams();
  if (params.page != null) q.set("page", String(params.page));
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.sourceType) q.set("sourceType", params.sourceType);
  if (params.orderId) q.set("orderId", params.orderId);
  if (params.memo?.trim()) q.set("memo", params.memo.trim());
  if (params.start) q.set("start", params.start);
  if (params.end) q.set("end", params.end);
  const qs = q.toString();
  const path = qs ? `/api/accounting/journal-entries?${qs}` : "/api/accounting/journal-entries";
  const res = await posApiFetch(path);
  let body: {
    success?: boolean;
    data?: JournalEntryDoc[];
    page?: number;
    limit?: number;
    total?: number;
    message?: string;
  };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    body = {};
  }
  if (!res.ok) {
    throw new Error(body.message || res.statusText || `Request failed (${res.status})`);
  }
  const entries = Array.isArray(body.data) ? body.data : [];
  const page = typeof body.page === "number" ? body.page : 1;
  const limit = typeof body.limit === "number" ? body.limit : entries.length || 20;
  const total = typeof body.total === "number" ? body.total : entries.length;
  return { entries, page, limit, total };
}

export async function posGetJournalEntry(id: string): Promise<JournalEntryDoc | null> {
  const res = await posApiJson<JournalEntryDoc>(`/api/accounting/journal-entries/${id}`);
  return res.data ?? null;
}

export async function posPostManualJournal(body: {
  memo?: string;
  entryDate?: string;
  lines: Array<{ account: string; debit: number; credit: number; memo?: string }>;
  idempotencyKey?: string;
}): Promise<JournalEntryDoc> {
  const headers: HeadersInit = {};
  if (body.idempotencyKey) headers["Idempotency-Key"] = body.idempotencyKey;
  const res = await posApiJson<JournalEntryDoc>("/api/accounting/journal-entries", {
    method: "POST",
    headers,
    body: JSON.stringify({
      memo: body.memo,
      entryDate: body.entryDate,
      lines: body.lines,
      idempotencyKey: body.idempotencyKey,
    }),
  });
  if (!res.data) throw new Error("No journal entry returned");
  return res.data;
}

export async function posPostArPayment(body: {
  customerId: string;
  amount: number;
  allocations?: Array<{ invoiceId: string; amount: number }>;
  idempotencyKey?: string;
}): Promise<JournalEntryDoc> {
  const headers: HeadersInit = {};
  if (body.idempotencyKey) headers["Idempotency-Key"] = body.idempotencyKey;
  const res = await posApiJson<JournalEntryDoc>("/api/accounting/ar/payments", {
    method: "POST",
    headers,
    body: JSON.stringify({
      customerId: body.customerId,
      amount: body.amount,
      allocations: body.allocations,
      idempotencyKey: body.idempotencyKey,
    }),
  });
  if (!res.data) throw new Error(res.message || "Payment failed");
  return res.data;
}

function parseFilenameFromDisposition(cd: string | null): string | null {
  if (!cd) return null;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  if (star) return decodeURIComponent(star[1].trim());
  const plain = /filename="([^"]+)"/i.exec(cd);
  if (plain) return plain[1].trim();
  const loose = /filename=([^;]+)/i.exec(cd);
  if (loose) return loose[1].trim().replace(/^"|"$/g, "");
  return null;
}

/** Download binary export (XLSX/PDF). Triggers save in the browser when passed to `triggerBrowserDownload`. */
export async function posDownloadAccountingExport(pathWithQuery: string): Promise<{ blob: Blob; filename: string }> {
  const path = pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`;
  const res = await posApiFetch(path);
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = (await res.json()) as { message?: string };
      if (typeof j.message === "string") msg = j.message;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const filename =
    parseFilenameFromDisposition(res.headers.get("Content-Disposition")) ||
    (path.includes(".csv") ? "journal-export.csv" : path.includes(".pdf") ? "trial-balance.pdf" : "trial-balance.xlsx");
  return { blob, filename };
}

/** `GET /api/accounting/audit-log` — `backoffice.accounting.read`; pass `page` + `limit` for paginated `{ total }` response. */
export type JournalAuditLogDoc = {
  _id: string;
  action: string;
  journalEntry?: { _id?: string; entryNumber?: number; sourceType?: string; memo?: string } | string | null;
  user?: { name?: string; email?: string } | string | null;
  idempotencyKey?: string;
  order?: string | null;
  payload?: Record<string, unknown> | null;
  createdAt: string;
};

export async function posFetchAuditLogs(params?: {
  page?: number;
  limit?: number;
  action?: string;
}): Promise<{ rows: JournalAuditLogDoc[]; page: number; limit: number; total: number }> {
  const q = new URLSearchParams();
  if (params?.page != null) q.set("page", String(params.page));
  if (params?.limit != null) q.set("limit", String(params.limit));
  if (params?.action?.trim()) q.set("action", params.action.trim());
  const qs = q.toString();
  const path = qs ? `/api/accounting/audit-log?${qs}` : "/api/accounting/audit-log";
  const res = await posApiFetch(path);
  let body: {
    success?: boolean;
    data?: JournalAuditLogDoc[];
    page?: number;
    limit?: number;
    total?: number;
    message?: string;
  };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    body = {};
  }
  if (!res.ok) {
    throw new Error(body.message || res.statusText || `Request failed (${res.status})`);
  }
  const rows = Array.isArray(body.data) ? body.data : [];
  const limit = typeof body.limit === "number" ? body.limit : (params?.limit ?? (rows.length > 0 ? rows.length : 25));
  const page = typeof body.page === "number" ? body.page : (params?.page ?? 1);
  const total = typeof body.total === "number" ? body.total : rows.length;
  return { rows, page, limit, total };
}

/** `GET /api/accounting/export/journals.csv` — `backoffice.accounting.gl.read`. */
export async function posDownloadJournalCsv(params?: {
  start?: string;
  end?: string;
}): Promise<{ blob: Blob; filename: string }> {
  const q = new URLSearchParams();
  if (params?.start) q.set("start", params.start);
  if (params?.end) q.set("end", params.end);
  const qs = q.toString();
  const path = qs ? `/api/accounting/export/journals.csv?${qs}` : "/api/accounting/export/journals.csv";
  return posDownloadAccountingExport(path);
}

/** `GET /api/accounting/export/journals.pdf` — formatted journal listing (server caps at 500 entries). */
export async function posDownloadJournalPdf(params?: {
  start?: string;
  end?: string;
}): Promise<{ blob: Blob; filename: string }> {
  const q = new URLSearchParams();
  if (params?.start) q.set("start", params.start);
  if (params?.end) q.set("end", params.end);
  const qs = q.toString();
  const path = qs ? `/api/accounting/export/journals.pdf?${qs}` : "/api/accounting/export/journals.pdf";
  return posDownloadAccountingExport(path);
}

/** `GET /api/accounting/export/trial-balance.pdf` — styled trial balance with PDF metadata. */
export async function posDownloadTrialBalancePdf(params?: {
  start?: string;
  end?: string;
}): Promise<{ blob: Blob; filename: string }> {
  const q = new URLSearchParams();
  if (params?.start) q.set("start", params.start);
  if (params?.end) q.set("end", params.end);
  const qs = q.toString();
  const path = qs ? `/api/accounting/export/trial-balance.pdf?${qs}` : "/api/accounting/export/trial-balance.pdf";
  return posDownloadAccountingExport(path);
}

/** `GET /api/accounting/export/integration.json` — `backoffice.accounting.gl.read`; saves pretty-printed bundle (may be large). */
export async function posDownloadGlIntegrationJson(params?: { start?: string; end?: string }): Promise<void> {
  const q = new URLSearchParams();
  if (params?.start) q.set("start", params.start);
  if (params?.end) q.set("end", params.end);
  const qs = q.toString();
  const path = qs ? `/api/accounting/export/integration.json?${qs}` : "/api/accounting/export/integration.json";
  const res = await posApiFetch(path);
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = (await res.json()) as { message?: string };
      if (typeof j.message === "string") msg = j.message;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const raw = (await res.json()) as unknown;
  const blob = new Blob([JSON.stringify(raw, null, 2)], { type: "application/json" });
  const stamp = [params?.start ?? "all", params?.end ?? "all"].join("_");
  triggerBrowserDownload(blob, `gl-integration-${stamp}.json`);
}

function accountingIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** `POST /api/accounting/post-order/:orderId` — requires `backoffice.accounting.write`. */
export async function posAccountingPostOrder(orderId: string): Promise<unknown> {
  const res = await posApiJson<unknown>(`/api/accounting/post-order/${orderId}`, {
    method: "POST",
    body: JSON.stringify({}),
    headers: { "Idempotency-Key": accountingIdempotencyKey() },
  });
  return res.data ?? res;
}

/** `POST /api/accounting/reverse-order/:orderId` — requires `backoffice.accounting.write`. */
export async function posAccountingReverseOrder(orderId: string): Promise<unknown> {
  const res = await posApiJson<unknown>(`/api/accounting/reverse-order/${orderId}`, {
    method: "POST",
    body: JSON.stringify({}),
    headers: { "Idempotency-Key": accountingIdempotencyKey() },
  });
  return res.data ?? res;
}

/** `POST /api/accounting/refunds/:orderId` — requires `backoffice.accounting.write`. */
export async function posAccountingPostOrderRefund(
  orderId: string,
  body: { amount: number; refundToAccountId?: string },
): Promise<unknown> {
  const idem = accountingIdempotencyKey();
  const res = await posApiJson<unknown>(`/api/accounting/refunds/${orderId}`, {
    method: "POST",
    body: JSON.stringify({ ...body, idempotencyKey: idem }),
    headers: { "Idempotency-Key": idem },
  });
  return res.data ?? res;
}

export type GiftCardStatus = "active" | "redeemed" | "expired" | "void";

export type GiftCardDoc = {
  _id: string;
  code: string;
  balance: number;
  initialAmount: number;
  status: GiftCardStatus;
  organization?: string;
  lastRedeemedAt?: string | null;
  expiresAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type GiftCardListResult = {
  items: GiftCardDoc[];
  total: number;
  limit: number;
  skip: number;
};

/** `GET /api/accounting/gift-cards` — requires `backoffice.accounting.ar.read`. */
export async function posFetchGiftCards(params?: {
  status?: GiftCardStatus;
  limit?: number;
  skip?: number;
}): Promise<GiftCardListResult> {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  if (params?.limit != null) q.set("limit", String(params.limit));
  if (params?.skip != null) q.set("skip", String(params.skip));
  const qs = q.toString();
  const path = qs ? `/api/accounting/gift-cards?${qs}` : "/api/accounting/gift-cards";
  const res = await posApiJson<GiftCardListResult>(path);
  return res.data ?? { items: [], total: 0, limit: 100, skip: 0 };
}

/** `POST /api/accounting/gift-cards/issue` — requires `backoffice.accounting.write`. */
export async function posAccountingIssueGiftCard(body: { amount: number; cashAccountId: string }): Promise<unknown> {
  const idem = accountingIdempotencyKey();
  const res = await posApiJson<unknown>("/api/accounting/gift-cards/issue", {
    method: "POST",
    body: JSON.stringify({ ...body, idempotencyKey: idem }),
    headers: { "Idempotency-Key": idem },
  });
  return res.data ?? res;
}

/** `POST /api/accounting/gift-cards/redeem` — requires `backoffice.accounting.write`. */
export async function posAccountingRedeemGiftCard(body: { code: string; amount: number }): Promise<unknown> {
  const idem = accountingIdempotencyKey();
  const res = await posApiJson<unknown>("/api/accounting/gift-cards/redeem", {
    method: "POST",
    body: JSON.stringify({ ...body, idempotencyKey: idem }),
    headers: { "Idempotency-Key": idem },
  });
  return res.data ?? res;
}

export type BankStatementLineDoc = {
  _id: string;
  postedAt?: string;
  amount?: number;
  description?: string;
  memo?: string;
  externalId?: string;
  status?: "unmatched" | "matched" | "cleared";
};

/** `GET /api/accounting/bank/statements` — `backoffice.accounting.bank.read`. */
export async function posFetchBankStatements(): Promise<BankStatementLineDoc[]> {
  const res = await posApiJson<BankStatementLineDoc[]>("/api/accounting/bank/statements");
  return Array.isArray(res.data) ? res.data : [];
}

export type BankCsvImportResult = {
  imported: number;
  skipped: number;
  duplicates: Array<{ row: number; reason: string; externalId?: string }>;
  errors: Array<{ row: number; reason: string }>;
  lines: BankStatementLineDoc[];
};

/** `POST /api/accounting/bank/statements/import` — CSV v1 multipart upload; requires `backoffice.accounting.write`. */
export async function posImportBankStatementsCsv(file: File): Promise<BankCsvImportResult> {
  const form = new FormData();
  form.append("file", file);
  const res = await posApiFetch("/api/accounting/bank/statements/import", {
    method: "POST",
    body: form,
    headers: { "Idempotency-Key": accountingIdempotencyKey() },
  });
  let body: unknown = {};
  try {
    body = await res.json();
  } catch {
    /* ignore */
  }
  const obj = body as { success?: boolean; message?: string; data?: BankCsvImportResult };
  if (!res.ok) {
    throw new Error(obj.message || res.statusText || `Import failed (${res.status})`);
  }
  const data = obj.data;
  if (!data) throw new Error("Server returned no import result.");
  return data;
}

export function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
