const mongoose = require("mongoose");
const AccountingAccount = require("../models/accountingAccountModel");
const JournalEntry = require("../models/journalEntryModel");
const AccountingConfig = require("../models/accountingConfigModel");
const AccountingSession = require("../models/accountingSessionModel");
const AccountingSequence = require("../models/accountingSequenceModel");
const JournalAuditLog = require("../models/journalAuditLogModel");
const AccountingPeriod = require("../models/accountingPeriodModel");
const AccountingInvoice = require("../models/accountingInvoiceModel");
const FxRate = require("../models/fxRateModel");
const StockMovement = require("../models/stockMovementModel");
const Order = require("../models/orderModel");
const Customer = require("../models/customerModel");
const Recipe = require("../models/recipeModel");
const Ingredient = require("../models/ingredientModel");
const GiftCard = require("../models/giftCardModel");
const VendorBill = require("../models/vendorBillModel");
const PurchaseOrder = require("../models/purchaseOrderModel");
const CreditNote = require("../models/creditNoteModel");
const BankStatementLine = require("../models/bankStatementLineModel");
const RecurringJournalTemplate = require("../models/recurringJournalTemplateModel");
const ExpenseReport = require("../models/expenseReportModel");
const ApprovalRequest = require("../models/approvalRequestModel");
const threeWayMatchService = require("./threeWayMatchService");
const {
  buildMenuCategoryRevenueIndex,
  resolveRevenueAccountIdFromCategoryMap,
  menuCategoryPathFromMap,
  menuCategoryLeafNameFromMap,
} = require("./categoryRevenueResolveService");
const Budget = require("../models/budgetModel");
const RecurringInvoiceTemplate = require("../models/recurringInvoiceTemplateModel");
const {
  computeStandardCogsCostFromOrder,
} = require("./cogsFromOrder");
const {
  NOTIFICATION_EVENTS,
  createBackofficeNotificationFromEvent,
} = require("./backofficeNotificationEvents");

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function normalizeOrderStatus(s) {
  if (s == null || s === "") return "pending";
  const key = String(s).toLowerCase().trim().replace(/\s+/g, " ");
  const map = {
    "in progress": "in-progress",
    pending: "pending",
    ready: "ready",
    served: "served",
    paid: "paid",
    cancelled: "cancelled",
  };
  if (map[key]) return map[key];
  return String(s).toLowerCase().replace(/\s+/g, "-");
}

/**
 * Builds a full menu-category allocation for one revenue GL bucket (journal credit line).
 * Uses the same extension weights as subtotal splitting in postOrderSaleLedger.
 *
 * @param {number} bucketCredit
 * @param {ReadonlyArray<{ ext: number; menuCategoryLeafId: string | null; menuCategoryPath: string; menuCategoryLeafName: string }>} bucketRows
 * @returns {{ mix: Array<Record<string, unknown>>; primary: { menuCategoryId?: string; menuCategoryPath?: string; menuCategoryName?: string } }}
 */
function buildOrderSaleRevenueCategoryMix(bucketCredit, bucketRows) {
  const credit = round2(Number(bucketCredit) || 0);
  const rows = Array.isArray(bucketRows) ? bucketRows : [];
  if (credit <= 0 || rows.length === 0) {
    return { mix: [], primary: {} };
  }

  /** @type {Map<string, { ext: number; path: string; name: string }>} */
  const byLeaf = new Map();
  for (const row of rows) {
    const key = row.menuCategoryLeafId != null ? String(row.menuCategoryLeafId) : "__none__";
    const cur = byLeaf.get(key) || {
      ext: 0,
      path: row.menuCategoryPath || "",
      name: row.menuCategoryLeafName || "",
    };
    cur.ext = round2(cur.ext + round2(Number(row.ext) || 0));
    if (!cur.path && row.menuCategoryPath) {
      cur.path = row.menuCategoryPath;
    }
    if (!cur.name && row.menuCategoryLeafName) {
      cur.name = row.menuCategoryLeafName;
    }
    byLeaf.set(key, cur);
  }

  const bucketExt = round2([...byLeaf.values()].reduce((s, v) => s + v.ext, 0));
  if (bucketExt <= 0) {
    return { mix: [], primary: {} };
  }

  const entries = [...byLeaf.entries()].sort((a, b) => b[1].ext - a[1].ext);
  const mix = [];
  let allocated = 0;
  for (let j = 0; j < entries.length; j++) {
    const [leafKey, agg] = entries[j];
    const part =
      j === entries.length - 1
        ? round2(credit - allocated)
        : round2((credit * agg.ext) / bucketExt);
    allocated = round2(allocated + part);
    const pct = round2((100 * agg.ext) / bucketExt);
    if (leafKey === "__none__") {
      mix.push({
        menuCategoryId: null,
        extensionWeight: agg.ext,
        pctOfBucketExtension: pct,
        allocatedSubtotal: part,
      });
    } else {
      mix.push({
        menuCategoryId: leafKey,
        menuCategoryPath: agg.path || undefined,
        menuCategoryName: agg.name || undefined,
        extensionWeight: agg.ext,
        pctOfBucketExtension: pct,
        allocatedSubtotal: part,
      });
    }
  }

  const topCategorized = mix.find((m) => m.menuCategoryId != null);
  const primary =
    topCategorized != null
      ? {
          menuCategoryId: String(topCategorized.menuCategoryId),
          menuCategoryPath: topCategorized.menuCategoryPath,
          menuCategoryName: topCategorized.menuCategoryName,
        }
      : {};

  return { mix, primary };
}

async function nextSequence(name, organizationId) {
  if (!organizationId) {
    throw new Error("nextSequence: organizationId is required");
  }
  const _id = `${name}:${String(organizationId)}`;
  const doc = await AccountingSequence.findOneAndUpdate(
    { _id },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return doc.seq;
}

function utcYearMonth(d) {
  const x = new Date(d);
  return { year: x.getUTCFullYear(), month: x.getUTCMonth() + 1 };
}

async function assertPostingAllowedForDate(entryDate, organizationId) {
  const { year, month } = utcYearMonth(entryDate || new Date());
  const p = await AccountingPeriod.findOne({
    year,
    month,
    organization: organizationId || null,
  }).lean();
  if (p && p.status === "closed") {
    const e = new Error(
      `Accounting period ${year}-${String(month).padStart(2, "0")} is closed.`
    );
    e.status = 400;
    throw e;
  }
}

function startOfUtcDay(d) {
  const x = new Date(d);
  return new Date(
    Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate())
  );
}

async function resolveFxRateFromTable(fromCurrency, toCurrency, asOf, organizationId) {
  const from = String(fromCurrency || "").toUpperCase();
  const to = String(toCurrency || "").toUpperCase();
  if (!from || !to || from === to) return 1;

  const day = startOfUtcDay(asOf || new Date());
  const orgQ = organizationId ? { organization: organizationId } : {};

  const direct = await FxRate.findOne({
    ...orgQ,
    fromCurrency: from,
    toCurrency: to,
    effectiveDate: { $lte: day },
  }).sort({ effectiveDate: -1 });

  if (direct && direct.rate > 0) return Number(direct.rate);

  const inverse = await FxRate.findOne({
    ...orgQ,
    fromCurrency: to,
    toCurrency: from,
    effectiveDate: { $lte: day },
  }).sort({ effectiveDate: -1 });

  if (inverse && inverse.rate > 0) return round2(1 / Number(inverse.rate));

  return null;
}

async function sumCostAmountForOrder(orderId) {
  const moves = await StockMovement.find({
    order: orderId,
    reason: "order_deduction",
  }).lean();
  let t = 0;
  for (const m of moves) {
    const reversed = await StockMovement.exists({ reversesMovement: m._id });
    if (reversed) continue;
    t += Number(m.costAmount || 0);
  }
  return round2(t);
}

async function writeAudit(
  action,
  entry,
  { idempotencyKey, userId, orderId, payload },
  organizationId
) {
  await JournalAuditLog.create({
    organization: organizationId || entry?.organization || null,
    action,
    journalEntry: entry?._id || null,
    idempotencyKey: idempotencyKey || "",
    user: userId || null,
    order: orderId || entry?.order || null,
    payload: payload || null,
  });
}

/**
 * Categorize source types for Cash Flow Statement (Indirect/Direct)
 */
function classifyCashFlow(sourceType) {
  const operating = [
    "order_sale",
    "order_refund",
    "order_reversal",
    "ar_payment",
    "vendor_bill_payment",
    "vendor_bill_void",
    "session_close",
    "order_cogs",
    "cogs_refund",
    "credit_note",
    "vendor_return_gl",
    "expense_report",
  ];
  if (operating.includes(sourceType)) return "operating";
  // Defaults for others
  return "none";
}

/**
 * Create journal + audit. Idempotency key returns existing row.
 * @param {object} doc
 * @param {{ idempotencyKey?: string, userId?: import("mongoose").Types.ObjectId|null, auditAction?: string, session?: import("mongoose").ClientSession|null }} [opts]
 */
async function createJournalEntry(doc, opts = {}) {
  const { idempotencyKey, userId, auditAction, session } = opts || {};
  const orgId = doc.organization;
  if (!orgId) {
    throw new Error("createJournalEntry: doc.organization is required");
  }
  if (idempotencyKey) {
    const dupQ = JournalEntry.findOne({
      organization: orgId,
      idempotencyKey,
    });
    if (session) dupQ.session(session);
    const hit = await dupQ;
    if (hit) {
      return { entry: hit, reused: true };
    }
  }
  await assertPostingAllowedForDate(doc.entryDate || new Date(), orgId);
  const entryNumber =
    doc.entryNumber ?? (await nextSequence("journalEntry", orgId));
  const row = {
    ...doc,
    entryNumber,
    cashFlowCategory: doc.cashFlowCategory || classifyCashFlow(doc.sourceType),
  };
  if (idempotencyKey) row.idempotencyKey = idempotencyKey;
  const created = session
    ? await JournalEntry.create([row], { session })
    : await JournalEntry.create(row);
  const entry = Array.isArray(created) ? created[0] : created;
  if (!session) {
    await writeAudit(
      auditAction || "journal.created",
      entry,
      {
        idempotencyKey,
        userId,
        orderId: entry.order,
        payload: { sourceType: entry.sourceType, entryNumber: entry.entryNumber },
      },
      orgId
    );
  }
  return { entry, reused: false };
}

/**
 * Post idempotent GL journal for a completed stock take (net inventory variance at cost).
 * @param {object} params
 * @param {import("mongoose").Types.ObjectId|string} params.organizationId
 * @param {import("mongoose").Types.ObjectId|string} params.sessionId
 * @param {import("mongoose").Types.ObjectId|string|null} params.locationId
 * @param {Array<{ varianceValue?: number }>} params.lines
 * @param {import("mongoose").Types.ObjectId|null|undefined} params.userId
 * @param {import("mongoose").Document|null} [params.accountingConfigDoc]
 * @param {import("mongoose").ClientSession|null} [params.session]
 */
async function postStockTakeJournalEntry(params) {
  const {
    organizationId,
    sessionId,
    locationId,
    lines,
    userId,
    accountingConfigDoc,
    session,
  } = params;
  const orgId = organizationId;
  const net = round2(
    (lines || []).reduce((s, l) => s + (Number(l.varianceValue) || 0), 0)
  );
  if (Math.abs(net) < 0.005) {
    return { entry: null, skipped: "zero_net" };
  }
  let invAcc =
    accountingConfigDoc?.defaultInventoryAssetAccount?._id ||
    accountingConfigDoc?.defaultInventoryAssetAccount;
  let varAcc =
    accountingConfigDoc?.defaultStockTakeVarianceAccount?._id ||
    accountingConfigDoc?.defaultStockTakeVarianceAccount;
  if (!invAcc || !varAcc) {
    const base = { organization: orgId };
    if (!invAcc) {
      const a = await AccountingAccount.findOne({ ...base, code: "1200" })
        .select("_id")
        .session(session || null)
        .lean();
      invAcc = a?._id || null;
    }
    if (!varAcc) {
      const a = await AccountingAccount.findOne({ ...base, code: "5150" })
        .select("_id")
        .session(session || null)
        .lean();
      varAcc = a?._id || null;
    }
  }
  if (!invAcc || !varAcc) {
    return { entry: null, skipped: "missing_accounts" };
  }
  const absAmt = round2(Math.abs(net));
  const memo = `Stock take · ${String(sessionId).slice(-10)}`;
  const jrLines =
    net > 0
      ? [
          { account: invAcc, debit: absAmt, credit: 0, memo },
          { account: varAcc, debit: 0, credit: absAmt, memo },
        ]
      : [
          { account: varAcc, debit: absAmt, credit: 0, memo },
          { account: invAcc, debit: 0, credit: absAmt, memo },
        ];
  const idempotencyKey = `stock_take:${String(sessionId)}`;
  const { entry } = await createJournalEntry(
    {
      organization: orgId,
      entryDate: new Date(),
      memo,
      sourceType: "stock_take",
      sourceId: sessionId,
      location: locationId || null,
      createdBy: userId || null,
      companyCurrency: accountingConfigDoc?.companyCurrency || "USD",
      lines: jrLines,
    },
    {
      idempotencyKey,
      userId,
      auditAction: "journal.stock_take",
      session,
    }
  );
  return { entry, skipped: null };
}

async function ensureDefaultAccountsAndConfig(organizationId) {
  if (!organizationId) {
    throw new Error("ensureDefaultAccountsAndConfig: organizationId is required");
  }
  const orgKey = organizationId;
  const defaults = [
    { code: "1000", name: "Cash on hand", type: "asset", sortOrder: 10 },
    { code: "1010", name: "Card clearing", type: "asset", sortOrder: 20 },
    { code: "1200", name: "Inventory asset", type: "asset", sortOrder: 25 },
    { code: "1300", name: "Accounts receivable — trade", type: "asset", sortOrder: 28 },
    { code: "2000", name: "Sales tax payable (standard)", type: "liability", sortOrder: 30 },
    { code: "2011", name: "Sales tax payable (reduced)", type: "liability", sortOrder: 31 },
    { code: "2100", name: "Customer loyalty liability", type: "liability", sortOrder: 40 },
    { code: "2110", name: "Gift cards outstanding", type: "liability", sortOrder: 41 },
    { code: "4000", name: "Food & beverage revenue", type: "revenue", sortOrder: 50 },
    { code: "4100", name: "Tips payable", type: "liability", sortOrder: 55 },
    { code: "5000", name: "Promotional discounts", type: "expense", sortOrder: 60 },
    { code: "5200", name: "Purchases & operating expenses (non-stock)", type: "expense", sortOrder: 65 },
    { code: "5100", name: "COGS — inventory", type: "expense", sortOrder: 70 },
    { code: "5150", name: "Stock count variance", type: "expense", sortOrder: 71 },
    { code: "3900", name: "Retained earnings", type: "equity", sortOrder: 45 },
    { code: "5900", name: "Cash over/short", type: "expense", sortOrder: 90 },
    { code: "2120", name: "Accounts payable", type: "liability", sortOrder: 42 },
    { code: "2130", name: "Goods received not invoiced (GRNI)", type: "liability", sortOrder: 43 },
    { code: "2140", name: "Customer deposits", type: "liability", sortOrder: 44 },
    { code: "2150", name: "Service charge payable", type: "liability", sortOrder: 45 },
  ];

  const byCode = new Map();
  for (const row of defaults) {
    let acc = await AccountingAccount.findOne({
      organization: orgKey,
      code: row.code,
    });
    if (!acc) {
      try {
        acc = await AccountingAccount.create({
          ...row,
          organization: orgKey,
        });
      } catch (e) {
        if (e && e.code === 11000) {
          acc = await AccountingAccount.findOne({
            organization: orgKey,
            code: row.code,
          });
          if (!acc) {
            const other = await AccountingAccount.findOne({ code: row.code })
              .select("organization")
              .lean();
            if (
              other &&
              String(other.organization || "") !== String(orgKey)
            ) {
              const err = new Error(
                "Chart defaults cannot be created: MongoDB has a legacy global unique index on AccountingAccount.code. " +
                  "Drop index `code_1` on `accountingaccounts` and keep the compound unique index { organization: 1, code: 1 } " +
                  `(see accountingAccountModel.js). Conflicting code: ${row.code}.`
              );
              err.status = 409;
              throw err;
            }
            acc = await AccountingAccount.findOne({
              organization: orgKey,
              code: row.code,
            });
          }
        }
        if (!acc) throw e;
      }
    }
    byCode.set(row.code, acc);
  }

  let cfg = await AccountingConfig.findOne({ organization: orgKey });
  if (!cfg) {
    cfg = await AccountingConfig.create({
      organization: orgKey,
      key: "default",
      companyCurrency: "USD",
      autoPostOnPaid: true,
      autoPostCogsOnPaid: true,
      defaultCostMethod: "fifo",
      stockDeductTrigger: "payment",
      strictOversell: false,
      reserveStockOnPending: true,
      defaultCashAccount: byCode.get("1000")._id,
      defaultCardClearingAccount: byCode.get("1010")._id,
      defaultTaxPayableAccount: byCode.get("2000")._id,
      defaultRevenueAccount: byCode.get("4000")._id,
      defaultDiscountAccount: byCode.get("5000")._id,
      defaultPurchasesExpenseAccount: byCode.get("5200")._id,
      defaultAccountsReceivableAccount: byCode.get("1300")._id,
      defaultTipsPayableAccount: byCode.get("4100")._id,
      defaultServiceChargePayableAccount: byCode.get("2150")._id,
      serviceChargeEnabled: false,
      serviceChargeRate: 0,
      retainedEarningsAccount: byCode.get("3900")._id,
      defaultGiftCardLiabilityAccount: byCode.get("2110")._id,
      taxRates: [
        {
          code: "standard",
          name: "Standard VAT",
          rate: 0.0525,
          account: byCode.get("2000")._id,
        },
        {
          code: "reduced",
          name: "Reduced rate",
          rate: 0.02,
          account: byCode.get("2011")._id,
        },
      ],
      paymentMethodAccounts: [
        { methodKey: "cash", account: byCode.get("1000")._id },
        { methodKey: "card", account: byCode.get("1010")._id },
        { methodKey: "online", account: byCode.get("1010")._id },
        { methodKey: "razorpay", account: byCode.get("1010")._id },
        { methodKey: "on_account", account: byCode.get("1300")._id },
      ],
      defaultAccountsPayableAccount: byCode.get("2120")._id,
      defaultGrniAccount: byCode.get("2130")._id,
      defaultCustomerDepositAccount: byCode.get("2140")._id,
      defaultInventoryAssetAccount: byCode.get("1200")._id,
      defaultStockTakeVarianceAccount: byCode.get("5150")._id,
    });
  } else {
    if (!cfg.organization) cfg.organization = orgKey;
    if (!cfg.defaultAccountsReceivableAccount) {
      cfg.defaultAccountsReceivableAccount = byCode.get("1300")._id;
    }
    if (!cfg.defaultTipsPayableAccount) {
      cfg.defaultTipsPayableAccount = byCode.get("4100")._id;
    }
    if (!cfg.defaultServiceChargePayableAccount) {
      cfg.defaultServiceChargePayableAccount = byCode.get("2150")._id;
    }
    if (cfg.serviceChargeEnabled === undefined) {
      cfg.serviceChargeEnabled = false;
    }
    if (cfg.serviceChargeRate === undefined) {
      cfg.serviceChargeRate = 0;
    }
    if (!cfg.companyCurrency) cfg.companyCurrency = "USD";
    if (cfg.autoPostCogsOnPaid === undefined) cfg.autoPostCogsOnPaid = true;
    if (!cfg.taxRates || cfg.taxRates.length === 0) {
      cfg.taxRates = [
        {
          code: "standard",
          name: "Standard VAT",
          rate: 0.0525,
          account: byCode.get("2000")._id,
        },
        {
          code: "reduced",
          name: "Reduced rate",
          rate: 0.02,
          account: byCode.get("2011")._id,
        },
      ];
    }
    if (!cfg.defaultCostMethod) cfg.defaultCostMethod = "fifo";
    if (!cfg.retainedEarningsAccount) {
      cfg.retainedEarningsAccount = byCode.get("3900")._id;
    }
    if (!cfg.defaultGiftCardLiabilityAccount) {
      cfg.defaultGiftCardLiabilityAccount = byCode.get("2110")._id;
    }
    if (!cfg.stockDeductTrigger) cfg.stockDeductTrigger = "payment";
    if (cfg.strictOversell === undefined) cfg.strictOversell = false;
    if (cfg.reserveStockOnPending === undefined) cfg.reserveStockOnPending = true;
    if (!cfg.defaultAccountsPayableAccount) {
      cfg.defaultAccountsPayableAccount = byCode.get("2120")._id;
    }
    if (!cfg.defaultGrniAccount) {
      cfg.defaultGrniAccount = byCode.get("2130")._id;
    }
    if (!cfg.defaultCustomerDepositAccount) {
      cfg.defaultCustomerDepositAccount = byCode.get("2140")._id;
    }
    if (!cfg.defaultInventoryAssetAccount) {
      cfg.defaultInventoryAssetAccount = byCode.get("1200")._id;
    }
    if (!cfg.defaultStockTakeVarianceAccount) {
      cfg.defaultStockTakeVarianceAccount = byCode.get("5150")._id;
    }
    if (!cfg.defaultPurchasesExpenseAccount) {
      cfg.defaultPurchasesExpenseAccount = byCode.get("5200")._id;
    }
    await cfg.save();
  }

  return { accounts: Object.fromEntries(byCode), config: cfg };
}

/**
 * Create branch-scoped chart rows for newly created locations.
 * Idempotent by (organization, location, code).
 */
async function bootstrapBranchAccounts(locationId, organizationId) {
  if (!locationId || !mongoose.Types.ObjectId.isValid(String(locationId))) {
    throw new Error("bootstrapBranchAccounts: valid locationId is required");
  }
  if (!organizationId) {
    throw new Error("bootstrapBranchAccounts: organizationId is required");
  }
  const locSuffix = String(locationId).slice(-6).toUpperCase();
  const rows = [
    { code: `4101-${locSuffix}`, name: "Food Sales", type: "revenue", sortOrder: 201 },
    { code: `4102-${locSuffix}`, name: "Beverage Sales", type: "revenue", sortOrder: 202 },
    { code: `4103-${locSuffix}`, name: "Alcohol Sales", type: "revenue", sortOrder: 203 },
    { code: `4110-${locSuffix}`, name: "Service Charge Income", type: "revenue", sortOrder: 204 },
    { code: `5101-${locSuffix}`, name: "Food Cost", type: "expense", sortOrder: 301 },
    { code: `5102-${locSuffix}`, name: "Beverage Cost", type: "expense", sortOrder: 302 },
    { code: `5103-${locSuffix}`, name: "Alcohol Cost", type: "expense", sortOrder: 303 },
    { code: `5201-${locSuffix}`, name: "Rent", type: "expense", sortOrder: 310 },
    { code: `5202-${locSuffix}`, name: "Salaries", type: "expense", sortOrder: 311 },
    { code: `5203-${locSuffix}`, name: "Utilities", type: "expense", sortOrder: 312 },
    { code: `5204-${locSuffix}`, name: "Marketing", type: "expense", sortOrder: 313 },
    { code: `5205-${locSuffix}`, name: "Cleaning", type: "expense", sortOrder: 314 },
    { code: `5206-${locSuffix}`, name: "Repairs", type: "expense", sortOrder: 315 },
    { code: `5299-${locSuffix}`, name: "Other", type: "expense", sortOrder: 316 },
    { code: `1101-${locSuffix}`, name: "Cash Drawer", type: "asset", sortOrder: 101 },
    { code: `1102-${locSuffix}`, name: "Bank Account", type: "asset", sortOrder: 102 },
    { code: `1201-${locSuffix}`, name: "Inventory Value", type: "asset", sortOrder: 103 },
    { code: `2101-${locSuffix}`, name: "VAT Payable", type: "liability", sortOrder: 151 },
    { code: `2102-${locSuffix}`, name: "Supplier Payables", type: "liability", sortOrder: 152 },
  ];
  const created = [];
  for (const row of rows) {
    let acc = await AccountingAccount.findOne({
      organization: organizationId,
      location: locationId,
      code: row.code,
    });
    if (!acc) {
      try {
        acc = await AccountingAccount.create({
          organization: organizationId,
          location: locationId,
          code: row.code,
          name: row.name,
          type: row.type,
          isActive: true,
          sortOrder: row.sortOrder,
        });
      } catch (error) {
        if (error && error.code === 11000) {
          acc = await AccountingAccount.findOne({
            organization: organizationId,
            location: locationId,
            code: row.code,
          });
        } else {
          throw error;
        }
      }
    }
    if (acc) created.push(acc);
  }
  return created;
}

async function getConfig(organizationId) {
  if (!organizationId) {
    throw new Error("getConfig: organizationId is required");
  }
  await ensureDefaultAccountsAndConfig(organizationId);
  const populate = [
    { path: "defaultCashAccount" },
    { path: "defaultCardClearingAccount" },
    { path: "defaultTaxPayableAccount" },
    { path: "defaultRevenueAccount" },
    { path: "defaultDiscountAccount" },
    { path: "defaultPurchasesExpenseAccount" },
    { path: "defaultAccountsReceivableAccount" },
    { path: "defaultTipsPayableAccount" },
    { path: "defaultServiceChargePayableAccount" },
    { path: "retainedEarningsAccount" },
    { path: "roundOffAccount" },
    { path: "realizedFxGainAccount" },
    { path: "realizedFxLossAccount" },
    { path: "defaultGiftCardLiabilityAccount" },
    { path: "defaultPurchasePriceVarianceAccount" },
    { path: "paymentMethodAccounts.account" },
    { path: "taxRates.account" },
    { path: "branchVatRates.location", select: "name" },
    { path: "defaultAccountsPayableAccount" },
    { path: "defaultGrniAccount" },
    { path: "defaultCustomerDepositAccount" },
    { path: "defaultInventoryAssetAccount" },
    { path: "defaultStockTakeVarianceAccount" },
  ];
  return AccountingConfig.findOne({ organization: organizationId }).populate(
    populate
  );
}

function resolveTenderAccount(cfg, paymentMethod, billingMode) {
  if (String(billingMode || "").toLowerCase() === "on_account") {
    return (
      cfg.defaultAccountsReceivableAccount?._id ||
      cfg.defaultAccountsReceivableAccount
    );
  }
  const key = String(paymentMethod || "cash")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_");
  const aliases = {
    "credit card": "card",
    debit: "card",
    upi: "online",
  };
  const k = aliases[key] || key;
  const row = (cfg.paymentMethodAccounts || []).find((m) => m.methodKey === k);
  if (row && row.account) return row.account._id || row.account;
  if (/card|online|razorpay|upi|gateway/.test(k)) {
    return cfg.defaultCardClearingAccount?._id || cfg.defaultCardClearingAccount;
  }
  return cfg.defaultCashAccount?._id || cfg.defaultCashAccount;
}

function resolveTaxAccount(cfg, code) {
  const c = String(code || "standard").toLowerCase();
  const tr = (cfg.taxRates || []).find(
    (t) => String(t.code).toLowerCase() === c
  );
  if (tr && tr.account) return tr.account._id || tr.account;
  return cfg.defaultTaxPayableAccount?._id || cfg.defaultTaxPayableAccount;
}

function taxKindForCode(cfg, code) {
  const c = String(code || "standard").toLowerCase();
  const tr = (cfg.taxRates || []).find(
    (t) => String(t.code).toLowerCase() === c
  );
  return tr?.kind || "sales";
}

function buildLineAnalytics(order) {
  const locationId = order?.location ? String(order.location) : null;
  const out = {
    orderId: order?._id ? String(order._id) : null,
    locationId,
    /** Same as locationId for branch-style reporting filters. */
    branchId: locationId,
    cashierUserId: order?.waiter ? String(order.waiter) : null,
  };
  return out;
}

function applyCompanyFxToLines(lines, fx, docCur, compCur) {
  const dc = String(docCur || "").toUpperCase();
  const cc = String(compCur || "").toUpperCase();
  if (!dc || !cc || dc === cc || !fx || fx === 1) return lines;
  return lines.map((l) => {
    const d = round2(l.debit);
    const c = round2(l.credit);
    return {
      ...l,
      documentDebit: d || undefined,
      documentCredit: c || undefined,
      debit: d ? round2(d * fx) : 0,
      credit: c ? round2(c * fx) : 0,
    };
  });
}

function balanceLinesWithRoundOff(lines, roundOffAccountId) {
  let d = 0;
  let c = 0;
  for (const l of lines) {
    d += round2(l.debit);
    c += round2(l.credit);
  }
  const diff = round2(d - c);
  if (Math.abs(diff) < 0.001) return lines;
  if (Math.abs(diff) < 0.05 && roundOffAccountId) {
    const id = roundOffAccountId;
    const next = [...lines];
    if (diff > 0) {
      next.push({
        account: id,
        debit: 0,
        credit: diff,
        memo: "Round-off",
      });
    } else {
      next.push({
        account: id,
        debit: round2(-diff),
        credit: 0,
        memo: "Round-off",
      });
    }
    return next;
  }
  return lines;
}

async function computeOrderCogsCost(order) {
  let total = 0;
  for (const line of order.items || []) {
    const mid = line.menuItem;
    if (!mid) continue;
    const recipe = await Recipe.findOne({ menuItem: mid }).lean();
    if (!recipe || !recipe.ingredients?.length) continue;
    const qty = Number(line.quantity || 1);
    for (const il of recipe.ingredients) {
      const ing = await Ingredient.findById(il.ingredient)
        .select("unitCost")
        .lean();
      if (!ing) continue;
      total += qty * Number(il.quantity || 0) * Number(ing.unitCost || 0);
    }
  }
  return round2(total);
}

async function postOrderCogsLedger(orderId, userId, idempotencyKey, opts = {}) {
  const { session = null } = opts;
  const oid = mongoose.Types.ObjectId.isValid(orderId)
    ? new mongoose.Types.ObjectId(orderId)
    : null;
  if (!oid) throw new Error("Invalid order id");

  const orderQ = Order.findById(oid);
  if (session) orderQ.session(session);
  const order = await orderQ;
  if (!order || normalizeOrderStatus(order.orderStatus) !== "paid") {
    throw new Error("Order not found or not paid");
  }
  const orgId = order.organization;
  if (!orgId) throw new Error("Order has no organization for accounting.");

  const existingQ = JournalEntry.findOne({
    organization: orgId,
    sourceType: "order_cogs",
    sourceId: oid,
  });
  if (session) existingQ.session(session);
  const existing = await existingQ;
  if (existing) return existing;

  await assertPostingAllowedForDate(order.paidAt || new Date(), orgId);

  const cfgDoc = await getConfig(orgId);
  if (cfgDoc.bigcapitalIntegrationEnabled) return null;
  if (!cfgDoc.autoPostCogsOnPaid) return null;

  let cost = await sumCostAmountForOrder(oid);
  if (cost <= 0) cost = await computeOrderCogsCost(order);
  if (cfgDoc.defaultCostMethod === "standard") {
    const orderPop = await Order.findById(oid)
      .populate("items.menuItem")
      .populate("items.menuItemVariant");
    const sc = computeStandardCogsCostFromOrder(orderPop);
    if (sc > 0) cost = sc;
  }
  if (cost <= 0) return null;

  const cogsAcc = await AccountingAccount.findOne({
    organization: orgId,
    code: "5100",
  });
  const invAcc = await AccountingAccount.findOne({
    organization: orgId,
    code: "1200",
  });
  if (!cogsAcc || !invAcc) throw new Error("COGS or inventory account missing");

  const iKey =
    idempotencyKey || `cogs:order:${String(oid)}`;
  const { entry } = await createJournalEntry(
    {
      organization: orgId,
      entryDate: order.paidAt || new Date(),
      memo: `COGS order ${oid}`,
      sourceType: "order_cogs",
      sourceId: oid,
      order: oid,
      location: order.location || null,
      createdBy: userId || null,
      companyCurrency: cfgDoc.companyCurrency || "USD",
      lines: [
        { account: cogsAcc._id, debit: cost, credit: 0, memo: "COGS" },
        { account: invAcc._id, debit: 0, credit: cost, memo: "Inventory relief" },
      ],
    },
    { idempotencyKey: iKey, userId, auditAction: "journal.cogs", session }
  );
  return entry;
}

async function postOrderSaleLedger(orderId, userId, idempotencyKey, opts = {}) {
  const { session = null } = opts;
  const oid = mongoose.Types.ObjectId.isValid(orderId)
    ? new mongoose.Types.ObjectId(orderId)
    : null;
  if (!oid) throw new Error("Invalid order id");

  const orderQ = Order.findById(oid)
    .populate("table", "tableNo")
    .populate({
      path: "items.menuItem",
      populate: {
        path: "category",
        populate: { path: "revenueAccount", select: "code name" },
      },
    });
  if (session) orderQ.session(session);
  const order = await orderQ;
  if (!order) throw new Error("Order not found");
  if (normalizeOrderStatus(order.orderStatus) !== "paid") {
    throw new Error("Order is not paid; no sale posting.");
  }
  const orgId = order.organization;
  if (!orgId) throw new Error("Order has no organization for accounting.");

  const existingQ = JournalEntry.findOne({
    organization: orgId,
    sourceType: "order_sale",
    sourceId: oid,
  });
  if (session) existingQ.session(session);
  const existing = await existingQ;
  if (existing) return existing;

  const cfgDoc = await getConfig(orgId);
  if (cfgDoc.bigcapitalIntegrationEnabled) return null;
  if (!cfgDoc.autoPostOnPaid) return null;

  const cfg = await AccountingConfig.findById(cfgDoc._id)
    .populate("defaultCashAccount")
    .populate("defaultCardClearingAccount")
    .populate("defaultTaxPayableAccount")
    .populate("defaultRevenueAccount")
    .populate("defaultDiscountAccount")
    .populate("defaultAccountsReceivableAccount")
    .populate("defaultTipsPayableAccount")
    .populate("defaultServiceChargePayableAccount")
    .populate("paymentMethodAccounts.account")
    .populate("taxRates.account")
    .populate("roundOffAccount")
    .populate("realizedFxGainAccount")
    .populate("realizedFxLossAccount");

  const billingMode = String(order.billingMode || "immediate").toLowerCase();

  const revenue = cfg.defaultRevenueAccount?._id || cfg.defaultRevenueAccount;
  const discAcc = cfg.defaultDiscountAccount?._id || cfg.defaultDiscountAccount;
  const tipsAcc = cfg.defaultTipsPayableAccount?._id || cfg.defaultTipsPayableAccount;
  const serviceChargePayableAcc =
    cfg.defaultServiceChargePayableAccount?._id ||
    cfg.defaultServiceChargePayableAccount;
  const taxDefault =
    cfg.defaultTaxPayableAccount?._id || cfg.defaultTaxPayableAccount;

  if (!revenue || !taxDefault) {
    throw new Error("Configure revenue and tax payable accounts.");
  }

  const subtotal = round2(order.bills?.total ?? 0);
  const tax = round2(order.bills?.tax ?? 0);
  /** Check total before staff/loyalty discounts (basis for discount %). */
  const grossPreDiscount = round2(subtotal + tax);
  const manualDisc = round2(Number(order.manualDiscountAmount ?? 0));
  const loyaltyDisc = round2(Number(order.loyaltyDiscountAmount ?? 0));
  const discount = round2(manualDisc + loyaltyDisc);
  const tip = round2(order.tipAmount ?? 0);
  const serviceCharge = round2(order.bills?.serviceChargeAmount ?? 0);
  const serviceChargeRate = round2(order.bills?.serviceChargeRate ?? 0);
  const totalWithTax = round2(order.bills?.totalWithTax ?? 0);

  if (totalWithTax <= 0) return null;

  const tableRef = order.table;
  const tableNo =
    tableRef && typeof tableRef === "object" && tableRef.tableNo != null
      ? Number(tableRef.tableNo)
      : null;
  const tableIdStr =
    tableRef && typeof tableRef === "object" && tableRef._id
      ? String(tableRef._id)
      : order.table
        ? String(order.table)
        : null;

  const pctOfGross = (part) => {
    if (!grossPreDiscount || grossPreDiscount <= 0) return null;
    return round2((round2(part) / grossPreDiscount) * 100);
  };
  const discountPct = discount > 0 ? pctOfGross(discount) : null;
  const manualDiscPct = manualDisc > 0 ? pctOfGross(manualDisc) : null;
  const loyaltyDiscPct = loyaltyDisc > 0 ? pctOfGross(loyaltyDisc) : null;

  const paidAt = order.paidAt || new Date();
  const dateYmd =
    paidAt && !Number.isNaN(new Date(paidAt).getTime())
      ? new Date(paidAt).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

  const compCur = cfgDoc.companyCurrency || "USD";
  const docCur = order.documentCurrency || compCur;
  let fx = Number(order.fxRateToCompany) > 0 ? Number(order.fxRateToCompany) : 1;
  if (docCur !== compCur && fx === 1) {
    const r = await resolveFxRateFromTable(
      docCur,
      compCur,
      order.paidAt || new Date(),
      orgId
    );
    if (r != null && r > 0) fx = r;
  }

  const ax = buildLineAnalytics(order);

  const lines = [];

  if (billingMode === "on_account") {
    const tender = resolveTenderAccount(
      cfg,
      order.paymentMethod,
      "on_account"
    );
    if (!tender) throw new Error("Configure tender / AR account.");
    lines.push({
      account: tender,
      debit: totalWithTax,
      credit: 0,
      memo: "Accounts receivable",
      analytics: ax,
    });
  } else {
    const splitsRaw = order.paymentSplits;
    const splits =
      Array.isArray(splitsRaw) && splitsRaw.length > 0 ? splitsRaw : null;
    if (splits) {
      let sumSplits = 0;
      for (let i = 0; i < splits.length; i++) {
        const ps = splits[i];
        const amt = round2(Number(ps.amount));
        if (amt <= 0) throw new Error("paymentSplits amounts must be positive.");
        const methodLabel =
          ps.methodKey != null ? String(ps.methodKey) : String(ps.method || "cash");
        const acc = resolveTenderAccount(cfg, methodLabel, null);
        if (!acc) throw new Error(`Configure tender for split method ${methodLabel}`);
        sumSplits = round2(sumSplits + amt);
        lines.push({
          account: acc,
          debit: amt,
          credit: 0,
          memo: `Tender ${methodLabel} (${i + 1}/${splits.length})`,
          analytics: ax,
        });
      }
      if (Math.abs(round2(sumSplits - totalWithTax)) > 0.05) {
        throw new Error("paymentSplits sum must match order totalWithTax.");
      }
    } else {
      const tender = resolveTenderAccount(cfg, order.paymentMethod, null);
      if (!tender) throw new Error("Configure tender / AR account.");
      lines.push({
        account: tender,
        debit: totalWithTax,
        credit: 0,
        memo: `Tender ${order.paymentMethod || "cash"}`,
        analytics: ax,
      });
    }
  }

  if (manualDisc > 0 && discAcc) {
    let itemDiscountSum = 0;
    for (const line of order.items || []) {
      const rowAmt = round2(Number(line?.discount?.amount || 0));
      if (rowAmt > 0) itemDiscountSum = round2(itemDiscountSum + rowAmt);
    }
    const billOnlyManual = round2(Math.max(0, manualDisc - itemDiscountSum));
    for (const line of order.items || []) {
      const lineDisc = round2(Number(line?.discount?.amount || 0));
      if (lineDisc <= 0) continue;
      const mi = line.menuItem;
      const lineLabel =
        (mi && typeof mi === "object" && mi.name) || line.name || "Line";
      let m = `Line discount "${String(lineLabel).slice(0, 60)}" $${lineDisc.toFixed(2)}`;
      if (tableNo != null) m += ` · Table ${tableNo}`;
      m += ` · ${dateYmd}`;
      lines.push({
        account: discAcc,
        debit: lineDisc,
        credit: 0,
        memo: m,
        analytics: {
          ...ax,
          orderLineId: line._id ? String(line._id) : null,
        },
      });
    }
    if (billOnlyManual > 0) {
      let m = `Staff / POS bill discount $${billOnlyManual.toFixed(2)}`;
      if (manualDiscPct != null) m += ` (${manualDiscPct}% of $${grossPreDiscount.toFixed(2)} check)`;
      if (tableNo != null) m += ` · Table ${tableNo}`;
      m += ` · ${dateYmd}`;
      lines.push({
        account: discAcc,
        debit: billOnlyManual,
        credit: 0,
        memo: m,
        analytics: ax,
      });
    }
  }
  if (loyaltyDisc > 0 && discAcc) {
    let m = `Loyalty discount $${loyaltyDisc.toFixed(2)}`;
    if (loyaltyDiscPct != null) m += ` (${loyaltyDiscPct}% of $${grossPreDiscount.toFixed(2)} check)`;
    if (tableNo != null) m += ` · Table ${tableNo}`;
    m += ` · ${dateYmd}`;
    lines.push({
      account: discAcc,
      debit: loyaltyDisc,
      credit: 0,
      memo: m,
      analytics: ax,
    });
  }

  const categoryRevenueIndex = await buildMenuCategoryRevenueIndex(orgId);

  const nets = [];
  for (const line of order.items || []) {
    const mi = line.menuItem;
    if (!mi) continue;
    const ext = round2(
      Number(line.pricePerQuantity ?? line.price ?? 0) *
        Number(line.quantity ?? 1)
    );
    if (ext <= 0) continue;
    let revAcc = revenue;
    let menuCategoryLeafId = null;
    let menuCategoryPath = "";
    let menuCategoryLeafName = "";
    if (typeof mi === "object" && mi.category) {
      const leafId =
        typeof mi.category === "object" && mi.category !== null && mi.category._id != null
          ? String(mi.category._id)
          : mongoose.Types.ObjectId.isValid(mi.category)
            ? String(mi.category)
            : null;
      if (leafId) {
        menuCategoryLeafId = leafId;
        menuCategoryPath = menuCategoryPathFromMap(leafId, categoryRevenueIndex);
        menuCategoryLeafName = menuCategoryLeafNameFromMap(leafId, categoryRevenueIndex);
        const resolved = resolveRevenueAccountIdFromCategoryMap(leafId, categoryRevenueIndex);
        if (resolved && mongoose.Types.ObjectId.isValid(resolved)) {
          revAcc = new mongoose.Types.ObjectId(resolved);
        }
      }
    }
    nets.push({
      ext,
      revAcc,
      menuCategoryLeafId,
      menuCategoryPath,
      menuCategoryLeafName,
    });
  }
  const netsByRev = new Map();
  for (const row of nets) {
    const k = String(row.revAcc);
    if (!netsByRev.has(k)) {
      netsByRev.set(k, []);
    }
    netsByRev.get(k).push(row);
  }

  const S = round2(nets.reduce((a, b) => a + b.ext, 0));
  const buckets = new Map();
  if (!nets.length) {
    buckets.set(String(revenue), subtotal);
  } else {
    let allocated = 0;
    for (let i = 0; i < nets.length; i++) {
      const row = nets[i];
      const { ext, revAcc } = row;
      const part =
        i === nets.length - 1
          ? round2(subtotal - allocated)
          : round2((subtotal * ext) / S);
      allocated = round2(allocated + part);
      const k = String(revAcc);
      buckets.set(k, round2((buckets.get(k) || 0) + part));
    }
  }
  let revIdx = 0;
  for (const [accKey, val] of buckets) {
    if (val <= 0) continue;
    const accId = mongoose.Types.ObjectId.isValid(accKey)
      ? new mongoose.Types.ObjectId(accKey)
      : revenue;
    const bucketRows = netsByRev.get(accKey) || [];
    const { mix, primary } = buildOrderSaleRevenueCategoryMix(val, bucketRows);
    const categoryAnalytics =
      mix.length > 0
        ? {
            orderSaleRevenueCategoryMix: mix,
            ...(primary.menuCategoryId
              ? {
                  menuCategoryId: primary.menuCategoryId,
                  menuCategoryPath: primary.menuCategoryPath,
                  menuCategoryName: primary.menuCategoryName,
                }
              : {}),
          }
        : {};
    lines.push({
      account: accId,
      debit: 0,
      credit: val,
      memo: buckets.size > 1 ? `Gross sales (${revIdx + 1})` : "Gross sales",
      analytics: {
        ...ax,
        orderSaleRevenueBucketIndex: revIdx,
        orderSaleRevenueBucketCount: buckets.size,
        ...categoryAnalytics,
      },
    });
    revIdx += 1;
  }

  const taxLines = order.bills?.taxLines;
  if (Array.isArray(taxLines) && taxLines.length > 0) {
    let sum = 0;
    for (const tl of taxLines) {
      const amt = round2(tl.amount);
      if (amt <= 0) continue;
      sum += amt;
      const acc = resolveTaxAccount(cfg, tl.code) || taxDefault;
      const kind = taxKindForCode(cfg, tl.code);
      const baseMemo = tl.label || tl.code || "Tax";
      lines.push({
        account: acc,
        debit: 0,
        credit: amt,
        memo: kind === "withholding" ? `WHT ${baseMemo}` : baseMemo,
        analytics: ax,
      });
    }
    if (round2(sum) !== tax && Math.abs(round2(sum - tax)) > 0.05) {
      throw new Error(
        "bills.taxLines amounts must sum to bills.tax (within 0.05 tolerance)."
      );
    }
  } else {
    lines.push({
      account: taxDefault,
      debit: 0,
      credit: tax,
      memo: "Sales tax payable",
      analytics: ax,
    });
  }

  if (tip > 0 && tipsAcc) {
    lines.push({
      account: tipsAcc,
      debit: 0,
      credit: tip,
      memo: "Tips payable",
      analytics: ax,
    });
  }
  if (serviceCharge > 0) {
    if (!serviceChargePayableAcc) {
      throw new Error("Configure service charge payable account.");
    }
    const memoRate = serviceChargeRate > 0 ? ` (${serviceChargeRate}%)` : "";
    lines.push({
      account: serviceChargePayableAcc,
      debit: 0,
      credit: serviceCharge,
      memo: `Service charge payable${memoRate}`,
      analytics: ax,
    });
  }

  const roundOffId = cfg.roundOffAccount?._id || cfg.roundOffAccount || null;
  let balanced = balanceLinesWithRoundOff(lines, roundOffId);

  let d = 0;
  let c = 0;
  for (const l of balanced) {
    d += round2(l.debit);
    c += round2(l.credit);
  }
  if (round2(d) !== round2(c)) {
    throw new Error(
      `Sale journal unbalanced: debits ${round2(d)} credits ${round2(c)}. Check subtotal/tax/tip/discount vs totalWithTax.`
    );
  }

  balanced = applyCompanyFxToLines(balanced, fx, docCur, compCur);

  const meta = {
    taxBreakdown: taxLines || [{ code: "default", amount: tax }],
    billingMode,
    subtotal,
    tax,
    grossPreDiscount,
    /** Total discount $ (staff + loyalty); same as sum of discount lines. */
    discount,
    discountTotal: discount,
    manualDiscountAmount: manualDisc,
    loyaltyDiscountAmount: loyaltyDisc,
    discountPercentOfGross: discountPct,
    manualDiscountPercentOfGross: manualDiscPct,
    loyaltyDiscountPercentOfGross: loyaltyDiscPct,
    tableNo,
    tableId: tableIdStr,
    saleDate: paidAt.toISOString(),
    tip,
    serviceCharge,
    serviceChargeRate,
    totalWithTax,
    paymentSplits: order.paymentSplits || null,
  };

  let entryMemo = `POS sale · Order ${String(oid).slice(-8)}`;
  if (tableNo != null) entryMemo += ` · Table ${tableNo}`;
  entryMemo += ` · ${dateYmd}`;
  if (discount > 0) {
    entryMemo += ` · Discount $${discount.toFixed(2)}`;
    if (discountPct != null) entryMemo += ` (${discountPct}% of check)`;
  }

  const iKey = idempotencyKey || `sale:order:${String(oid)}`;

  const { entry } = await createJournalEntry(
    {
      organization: orgId,
      entryDate: paidAt,
      memo: entryMemo,
      sourceType: "order_sale",
      sourceId: oid,
      order: oid,
      location: order.location || null,
      createdBy: userId || null,
      companyCurrency: compCur,
      documentCurrency: docCur !== compCur ? docCur : null,
      fxRateToCompany: fx,
      metadata: meta,
      lines: balanced,
    },
    { idempotencyKey: iKey, userId, auditAction: "journal.sale", session }
  );

  if (billingMode === "on_account" && order.customer) {
    const updateQ = Customer.updateOne(
      { _id: order.customer },
      { $inc: { arBalance: totalWithTax } }
    );
    if (session) updateQ.session(session);
    await updateQ;
  }

  return entry;
}

async function reverseOrderSaleLedger(orderId, userId) {
  const oid = mongoose.Types.ObjectId.isValid(orderId)
    ? new mongoose.Types.ObjectId(orderId)
    : null;
  if (!oid) throw new Error("Invalid order id");

  const sale = await JournalEntry.findOne({
    sourceType: "order_sale",
    sourceId: oid,
  });
  if (!sale) throw new Error("No sale journal to reverse for this order.");
  const orgId = sale.organization;
  if (!orgId) throw new Error("Sale journal missing organization.");

  const revExisting = await JournalEntry.findOne({
    organization: orgId,
    sourceType: "order_reversal",
    sourceId: oid,
  });
  if (revExisting) return revExisting;

  const lines = sale.lines.map((l) => ({
    account: l.account,
    debit: round2(l.credit),
    credit: round2(l.debit),
    memo: `Reversal: ${l.memo || ""}`,
  }));

  await assertPostingAllowedForDate(new Date(), orgId);
  const entryNumber = await nextSequence("journalEntry", orgId);
  const entry = await JournalEntry.create({
    organization: orgId,
    entryNumber,
    entryDate: new Date(),
    memo: `Reversal POS order ${oid}`,
    sourceType: "order_reversal",
    sourceId: oid,
    order: oid,
    location: sale.location || null,
    createdBy: userId || null,
    companyCurrency: sale.companyCurrency || "USD",
    lines,
  });
  await writeAudit("journal.reversal", entry, { userId, orderId: oid }, orgId);

  const order = await Order.findById(oid);
  if (
    order &&
    String(order.billingMode || "").toLowerCase() === "on_account" &&
    order.customer
  ) {
    const tw = round2(order.bills?.totalWithTax ?? 0);
    await Customer.updateOne(
      { _id: order.customer },
      { $inc: { arBalance: -tw } }
    );
  }

  return entry;
}

async function reverseOrderCogsLedger(orderId, userId) {
  const oid = mongoose.Types.ObjectId.isValid(orderId)
    ? new mongoose.Types.ObjectId(orderId)
    : null;
  if (!oid) throw new Error("Invalid order id");

  const cogs = await JournalEntry.findOne({
    sourceType: "order_cogs",
    sourceId: oid,
  });
  if (!cogs) return null;
  const orgId = cogs.organization;
  if (!orgId) throw new Error("COGS journal missing organization.");

  const dup = await JournalEntry.findOne({
    organization: orgId,
    order: oid,
    sourceType: "order_reversal",
    "metadata.cogsReversal": true,
  });
  if (dup) return dup;

  const revId = new mongoose.Types.ObjectId();
  const lines = cogs.lines.map((l) => ({
    account: l.account,
    debit: round2(l.credit),
    credit: round2(l.debit),
    memo: `COGS reversal: ${l.memo || ""}`,
  }));

  await assertPostingAllowedForDate(new Date(), orgId);
  const entryNumber = await nextSequence("journalEntry", orgId);
  const entry = await JournalEntry.create({
    organization: orgId,
    entryNumber,
    entryDate: new Date(),
    memo: `COGS reversal order ${oid}`,
    sourceType: "order_reversal",
    sourceId: revId,
    order: oid,
    location: cogs.location || null,
    createdBy: userId || null,
    metadata: { cogsReversal: true },
    lines,
  });
  await writeAudit("journal.cogs_reversal", entry, { userId, orderId: oid }, orgId);
  return entry;
}

/**
 * Partial refund: reduces cash/tender, reduces revenue & tax proportionally to `amount`.
 */
async function postOrderRefund({
  orderId,
  amount,
  userId,
  idempotencyKey,
  refundToAccountId,
}) {
  const oid = mongoose.Types.ObjectId.isValid(orderId)
    ? new mongoose.Types.ObjectId(orderId)
    : null;
  if (!oid) throw new Error("Invalid order id");
  const amt = round2(amount);
  if (amt <= 0) throw new Error("Refund amount must be positive");

  const sale = await JournalEntry.findOne({
    sourceType: "order_sale",
    sourceId: oid,
  }).populate("lines.account");
  if (!sale) throw new Error("No sale journal for this order.");
  const orgId = sale.organization;
  if (!orgId) throw new Error("Sale journal missing organization.");

  const tenderLine = sale.lines.find((l) => round2(l.debit) > 0);
  if (!tenderLine) throw new Error("Sale journal missing tender line.");
  const origTender = round2(tenderLine.debit);
  if (amt > origTender + 0.02) {
    throw new Error("Refund exceeds original tender.");
  }

  const creditLines = sale.lines.filter((l) => round2(l.credit) > 0);
  if (!creditLines.length) throw new Error("Sale has no credit lines to unwind.");

  const totalCr = round2(
    creditLines.reduce((s, l) => s + round2(l.credit), 0)
  );
  if (totalCr <= 0) throw new Error("No credit amounts on sale.");

  const debitLines = [];
  let allocated = 0;
  creditLines.forEach((l, i) => {
    const cr = round2(l.credit);
    let p =
      i === creditLines.length - 1
        ? round2(amt - allocated)
        : round2((amt * cr) / totalCr);
    if (p < 0) p = 0;
    allocated = round2(allocated + p);
    debitLines.push({
      account: l.account._id || l.account,
      debit: p,
      credit: 0,
      memo: `Refund: ${l.memo || ""}`,
    });
  });

  const sumDebits = round2(debitLines.reduce((s, x) => s + x.debit, 0));
  if (Math.abs(sumDebits - amt) > 0.02) {
    debitLines[debitLines.length - 1].debit = round2(
      debitLines[debitLines.length - 1].debit + (amt - sumDebits)
    );
  }

  const creditTender = refundToAccountId || tenderLine.account._id || tenderLine.account;
  const lines = [
    {
      account: creditTender,
      debit: 0,
      credit: amt,
      memo: "Refund tender out",
    },
    ...debitLines,
  ];

  const refundSourceId = new mongoose.Types.ObjectId();
  const iKey = idempotencyKey || `refund:${String(oid)}:${amt}:${Date.now()}`;

  const { entry } = await createJournalEntry(
    {
      organization: orgId,
      entryDate: new Date(),
      memo: `Refund order ${oid} amount ${amt}`,
      sourceType: "order_refund",
      sourceId: refundSourceId,
      order: oid,
      location: sale.location || null,
      createdBy: userId || null,
      companyCurrency: sale.companyCurrency || "USD",
      metadata: { originalOrderId: String(oid), amount: amt, splitBasis: totalCr },
      lines,
    },
    { idempotencyKey: iKey, userId, auditAction: "journal.refund" }
  );

  try {
    await postPartialCogsRefund({
      orderId: oid,
      refundAmount: amt,
      userId,
      idempotencyKey: iKey,
    });
  } catch (e) {
    console.error("[accounting] postPartialCogsRefund:", e.message);
  }

  return entry;
}

async function postPartialCogsRefund({
  orderId,
  refundAmount,
  userId,
  idempotencyKey,
}) {
  const oid = mongoose.Types.ObjectId.isValid(orderId)
    ? new mongoose.Types.ObjectId(orderId)
    : null;
  if (!oid) throw new Error("Invalid order id");

  const order = await Order.findById(oid).lean();
  const totalSale = round2(order?.bills?.totalWithTax ?? 0);
  if (totalSale <= 0) return null;

  const cogs = await JournalEntry.findOne({
    sourceType: "order_cogs",
    sourceId: oid,
    organization: order.organization || null,
  });
  if (!cogs) return null;

  const cogsDr = cogs.lines.find((l) => round2(l.debit) > 0);
  const origCogs = cogsDr ? round2(cogsDr.debit) : 0;
  if (origCogs <= 0) return null;

  const ratio = Math.min(1, round2(refundAmount) / totalSale);
  const rev = round2(origCogs * ratio);
  if (rev <= 0) return null;

  const invLine = cogs.lines.find((l) => round2(l.credit) > 0);
  const cogsAcc = cogsDr.account;
  const invAcc = invLine?.account;
  if (!invAcc) return null;

  const iKey =
    idempotencyKey != null && String(idempotencyKey).trim()
      ? `${String(idempotencyKey).trim()}:cogs-refund`
      : `cogs-refund:${String(oid)}:${refundAmount}:${Date.now()}`;

  const refundSid = new mongoose.Types.ObjectId();
  const glOrg = cogs.organization || order.organization;
  if (!glOrg) return null;
  const { entry } = await createJournalEntry(
    {
      organization: glOrg,
      entryDate: new Date(),
      memo: `COGS refund (proportional) order ${oid}`,
      sourceType: "cogs_refund",
      sourceId: refundSid,
      order: oid,
      location: order?.location || null,
      createdBy: userId || null,
      companyCurrency: cogs.companyCurrency || "USD",
      lines: [
        { account: cogsAcc, debit: 0, credit: rev, memo: "Reduce COGS" },
        { account: invAcc, debit: rev, credit: 0, memo: "Restore inventory" },
      ],
    },
    { idempotencyKey: iKey, userId, auditAction: "journal.cogs_refund" }
  );
  return entry;
}

async function postArPayment({
  customerId,
  amount,
  userId,
  idempotencyKey,
  allocations,
  organizationId,
}) {
  if (!mongoose.Types.ObjectId.isValid(customerId)) {
    throw new Error("Invalid customer id");
  }
  const amt = round2(amount);
  if (amt <= 0) throw new Error("Amount must be positive");
  if (!organizationId) throw new Error("organizationId is required");

  const cfg = await getConfig(organizationId);
  const cash = cfg.defaultCashAccount?._id || cfg.defaultCashAccount;
  const ar = cfg.defaultAccountsReceivableAccount?._id || cfg.defaultAccountsReceivableAccount;
  if (!cash || !ar) throw new Error("Configure cash and AR accounts.");

  const custBefore = await Customer.findById(customerId).select("arBalance").lean();
  const balStart = round2(Number(custBefore?.arBalance || 0));

  const cid = new mongoose.Types.ObjectId();
  const iKey = idempotencyKey || `ar:${String(customerId)}:${amt}:${Date.now()}`;

  const allocList = [];
  let explicitSum = 0;
  if (Array.isArray(allocations) && allocations.length > 0) {
    for (const a of allocations) {
      if (!a || !mongoose.Types.ObjectId.isValid(a.invoiceId)) continue;
      const inv = await AccountingInvoice.findOne({
        _id: a.invoiceId,
        organization: organizationId,
      });
      if (!inv) throw new Error(`Invoice not found: ${a.invoiceId}`);
      if (String(inv.customer) !== String(customerId)) {
        throw new Error("Invoice does not belong to this customer.");
      }
      if (inv.status === "void" || inv.status === "paid") continue;
      const due = round2(Number(inv.total) - Number(inv.amountPaid || 0));
      const pay = round2(Math.min(due, Number(a.amount) || 0));
      if (pay <= 0) continue;
      allocList.push({ inv, pay });
      explicitSum = round2(explicitSum + pay);
    }
    if (explicitSum - amt > 0.02) {
      throw new Error("Allocations exceed payment amount.");
    }
  }

  let remaining = round2(amt - explicitSum);
  if (remaining > 0.001) {
    const openInv = await AccountingInvoice.find({
      organization: organizationId,
      customer: customerId,
      status: { $in: ["posted", "open", "partial"] },
    }).sort({ dueDate: 1 });
    for (const inv of openInv) {
      const already = allocList.find((x) => String(x.inv._id) === String(inv._id));
      if (already) continue;
      const due = round2(Number(inv.total) - Number(inv.amountPaid || 0));
      if (due <= 0) continue;
      const pay = round2(Math.min(due, remaining));
      if (pay <= 0) continue;
      allocList.push({ inv, pay });
      remaining = round2(remaining - pay);
      if (remaining <= 0.001) break;
    }
  }

  const appliedFromInvoices = round2(allocList.reduce((sum, x) => sum + x.pay, 0));
  const unallocated = round2(amt - appliedFromInvoices);
  const payOnOrderAr = round2(
    Math.min(
      Math.max(0, unallocated),
      Math.max(0, round2(balStart - appliedFromInvoices)),
    ),
  );
  const arCreditTotal = round2(appliedFromInvoices + payOnOrderAr);
  const excess = round2(amt - arCreditTotal);
  const depositAcc = cfg.defaultCustomerDepositAccount?._id || cfg.defaultCustomerDepositAccount;

  if (excess > 0.001 && !depositAcc) {
    throw new Error(
      "AR payment exceeds applied AR and no customer deposit account is configured. " +
        "Set defaultCustomerDepositAccount in GL settings (or reduce the payment amount)."
    );
  }

  for (const { inv, pay } of allocList) {
    inv.amountPaid = round2(Number(inv.amountPaid || 0) + pay);
    if (inv.amountPaid >= round2(Number(inv.total)) - 0.02) {
      inv.status = "paid";
    } else {
      inv.status = "partial";
    }
    await inv.save();
  }

  const journalLines = [
    { account: cash, debit: amt, credit: 0, memo: "Cash in" },
    { account: ar, debit: 0, credit: arCreditTotal, memo: "Reduce AR" },
  ];
  if (excess > 0 && depositAcc) {
    journalLines.push({
      account: depositAcc,
      debit: 0,
      credit: excess,
      memo: "Excess payment to customer deposit",
    });
  }

  const { entry } = await createJournalEntry(
    {
      organization: organizationId,
      entryDate: new Date(),
      memo: `AR payment customer ${customerId}`,
      sourceType: "ar_payment",
      sourceId: cid,
      createdBy: userId || null,
      companyCurrency: cfg.companyCurrency || "USD",
      lines: journalLines,
      metadata: {
        allocations: allocList.map((x) => ({
          invoiceId: String(x.inv._id),
          amount: x.pay,
        })),
        excessAmount: excess,
      },
    },
    { idempotencyKey: iKey, userId, auditAction: "journal.ar_payment" }
  );

  if (excess > 0) {
    await Customer.updateOne(
      { _id: customerId },
      { $inc: { unappliedCredit: excess } }
    );
  }

  await Customer.updateOne({ _id: customerId }, { $inc: { arBalance: -arCreditTotal } });
  return entry;
}

function sliceAccountingErrorMessage(msg) {
  const s = msg != null ? String(msg) : "Unknown error";
  return s.length > 500 ? s.slice(0, 500) : s;
}

/**
 * API-safe snapshot of persisted order GL posting fields.
 * @param {import("mongoose").Document | Record<string, unknown> | null | undefined} order
 */
function accountingPostingFromOrder(order) {
  if (!order) {
    return {
      sale: { status: null },
      cogs: { status: null },
    };
  }
  const o = order.toObject ? order.toObject() : order;
  const saleStatus = o.accountingSaleStatus ?? null;
  const cogsStatus = o.accountingCogsStatus ?? null;
  const out = {
    sale: { status: saleStatus },
    cogs: { status: cogsStatus },
  };
  if (o.accountingSaleError) out.sale.error = String(o.accountingSaleError);
  if (o.accountingCogsError) out.cogs.error = String(o.accountingCogsError);
  return out;
}

/**
 * When an order first becomes `paid`, post sale (and optionally COGS) journals and
 * persist outcomes on the order for support, queries, and API clients.
 * @returns {Promise<{ sale: unknown; cogs: unknown; error?: string; cogsError?: string } | null>}
 */
async function onOrderBecamePaid(order, previousStatus, userId, opts = {}) {
  const { session = null } = opts;
  const prev = normalizeOrderStatus(previousStatus);
  const cur = normalizeOrderStatus(order.orderStatus);
  if (cur !== "paid" || prev === "paid") return null;

  const oid = order._id;

  let saleEntry = null;
  try {
    saleEntry = await postOrderSaleLedger(oid, userId, undefined, { session });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[accounting] postOrderSaleLedger failed:", msg);
    await createBackofficeNotificationFromEvent(
      NOTIFICATION_EVENTS.ACCOUNTING_SALE_POST_FAILED,
      {
        organizationId: order.organization || null,
        orderId: String(oid),
        body: `Order ${String(oid).slice(-8)} sale posting failed: ${sliceAccountingErrorMessage(msg)}`,
      },
    );
    const updateQ = Order.updateOne(
      { _id: oid },
      {
        $set: {
          accountingSaleStatus: "failed",
          accountingSaleError: sliceAccountingErrorMessage(msg),
          accountingSalePostedAt: null,
          accountingCogsStatus: "skipped",
          accountingCogsError: "Skipped because sale journal failed",
          accountingCogsPostedAt: null,
        },
      }
    );
    if (session) updateQ.session(session);
    await updateQ;
    if (session) {
      throw e instanceof Error ? e : new Error(msg);
    }
    return { sale: null, cogs: null, error: msg };
  }

  if (saleEntry) {
    const postedAt =
      saleEntry.entryDate && !Number.isNaN(new Date(saleEntry.entryDate).getTime())
        ? new Date(saleEntry.entryDate)
        : saleEntry.createdAt && !Number.isNaN(new Date(saleEntry.createdAt).getTime())
          ? new Date(saleEntry.createdAt)
          : new Date();
    const updateQ = Order.updateOne(
      { _id: oid },
      {
        $set: {
          accountingSaleStatus: "ok",
          accountingSaleError: "",
          accountingSalePostedAt: postedAt,
        },
      }
    );
    if (session) updateQ.session(session);
    await updateQ;
  } else {
    const updateQ = Order.updateOne(
      { _id: oid },
      {
        $set: {
          accountingSaleStatus: "skipped",
          accountingSaleError: "",
          accountingSalePostedAt: null,
        },
      }
    );
    if (session) updateQ.session(session);
    await updateQ;
  }

  let cogsEntry = null;
  try {
    cogsEntry = await postOrderCogsLedger(oid, userId, undefined, { session });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[accounting] postOrderCogsLedger failed:", msg);
    await createBackofficeNotificationFromEvent(
      NOTIFICATION_EVENTS.ACCOUNTING_COGS_POST_FAILED,
      {
        organizationId: order.organization || null,
        orderId: String(oid),
        body: `Order ${String(oid).slice(-8)} COGS posting failed: ${sliceAccountingErrorMessage(msg)}`,
      },
    );
    const updateQ = Order.updateOne(
      { _id: oid },
      {
        $set: {
          accountingCogsStatus: "failed",
          accountingCogsError: sliceAccountingErrorMessage(msg),
          accountingCogsPostedAt: null,
        },
      }
    );
    if (session) updateQ.session(session);
    await updateQ;
    if (session) {
      throw e instanceof Error ? e : new Error(msg);
    }
    return { sale: saleEntry, cogs: null, cogsError: msg };
  }

  if (cogsEntry) {
    const postedAt =
      cogsEntry.entryDate && !Number.isNaN(new Date(cogsEntry.entryDate).getTime())
        ? new Date(cogsEntry.entryDate)
        : cogsEntry.createdAt && !Number.isNaN(new Date(cogsEntry.createdAt).getTime())
          ? new Date(cogsEntry.createdAt)
          : new Date();
    const updateQ = Order.updateOne(
      { _id: oid },
      {
        $set: {
          accountingCogsStatus: "ok",
          accountingCogsError: "",
          accountingCogsPostedAt: postedAt,
        },
      }
    );
    if (session) updateQ.session(session);
    await updateQ;
  } else {
    const updateQ = Order.updateOne(
      { _id: oid },
      {
        $set: {
          accountingCogsStatus: "skipped",
          accountingCogsError: "",
          accountingCogsPostedAt: null,
        },
      }
    );
    if (session) updateQ.session(session);
    await updateQ;
  }

  return { sale: saleEntry, cogs: cogsEntry };
}

async function trialBalance({ start, end, organizationId, locationId, costCenter } = {}) {
  if (!organizationId) {
    throw new Error("trialBalance: organizationId is required");
  }
  const match = { organization: organizationId };
  if (start || end) {
    match.entryDate = {};
    if (start) match.entryDate.$gte = new Date(start);
    if (end) match.entryDate.$lte = new Date(end);
  }
  if (locationId) {
    match.location = new mongoose.Types.ObjectId(String(locationId));
  }

  const pipeline = [{ $match: match }];
  pipeline.push({ $unwind: "$lines" });
  const cc = costCenter != null ? String(costCenter).trim() : "";
  if (cc) {
    pipeline.push({ $match: { "lines.analytics.costCenter": cc } });
  }
  pipeline.push({
    $group: {
      _id: "$lines.account",
      debit: { $sum: "$lines.debit" },
      credit: { $sum: "$lines.credit" },
    },
  });

  const rows = await JournalEntry.aggregate(pipeline);
  const ids = rows.map((r) => r._id).filter(Boolean);
  const accounts = await AccountingAccount.find({
    organization: organizationId,
    _id: { $in: ids },
  }).lean();
  const accMap = new Map(accounts.map((a) => [String(a._id), a]));

  const detail = rows.map((r) => {
    const a = accMap.get(String(r._id));
    const debit = round2(r.debit);
    const credit = round2(r.credit);
    return {
      accountId: r._id,
      code: a?.code,
      name: a?.name,
      type: a?.type,
      debit,
      credit,
      balance: round2(debit - credit),
    };
  });

  const totalDebit = round2(detail.reduce((s, r) => s + r.debit, 0));
  const totalCredit = round2(detail.reduce((s, r) => s + r.credit, 0));

  return {
    rows: detail.sort((a, b) => String(a.code).localeCompare(String(b.code))),
    totalDebit,
    totalCredit,
    balanced: totalDebit === totalCredit,
    locationId: locationId || null,
    costCenter: cc || null,
  };
}

function aggregateByType(tb) {
  let revenue = 0;
  let expense = 0;
  const assets = [];
  const liabilities = [];
  const equity = [];
  for (const r of tb.rows) {
    const net = round2(r.credit - r.debit);
    const bal = round2(r.debit - r.credit);
    if (r.type === "revenue") revenue += net;
    if (r.type === "expense") {
      expense += round2(r.debit - r.credit);
    }
    if (r.type === "asset") assets.push({ ...r, netBalance: bal });
    if (r.type === "liability") liabilities.push({ ...r, netBalance: -bal });
    if (r.type === "equity") equity.push({ ...r, netBalance: bal });
  }
  return {
    revenue: round2(revenue),
    expense: round2(expense),
    netOperating: round2(revenue - expense),
    assets,
    liabilities,
    equity,
  };
}

async function cogsFromJournalSources({
  start,
  end,
  organizationId,
  locationId,
  costCenter,
}) {
  if (!organizationId) {
    throw new Error("cogsFromJournalSources: organizationId is required");
  }
  const expenseAccountIds = await AccountingAccount.find({
    organization: organizationId,
    type: "expense",
  })
    .select("_id")
    .lean();
  const ids = expenseAccountIds.map((row) => row._id).filter(Boolean);
  if (ids.length === 0) return 0;

  const match = {
    organization: organizationId,
    sourceType: { $in: ["order_cogs", "cogs_refund"] },
  };
  if (start || end) {
    match.entryDate = {};
    if (start) match.entryDate.$gte = new Date(start);
    if (end) match.entryDate.$lte = new Date(end);
  }
  if (locationId) {
    match.location = new mongoose.Types.ObjectId(String(locationId));
  }
  const cc = costCenter != null ? String(costCenter).trim() : "";
  const pipeline = [
    { $match: match },
    { $unwind: "$lines" },
    { $match: { "lines.account": { $in: ids } } },
  ];
  if (cc) {
    pipeline.push({ $match: { "lines.analytics.costCenter": cc } });
  }
  pipeline.push({
    $group: {
      _id: null,
      value: { $sum: { $subtract: ["$lines.debit", "$lines.credit"] } },
    },
  });
  const rows = await JournalEntry.aggregate(pipeline);
  return round2(rows[0]?.value || 0);
}

async function cashFlowReport({ start, end, organizationId, locationId, costCenter }) {
  const cfg = await getConfig(organizationId);
  const cashAccounts = [
    cfg.defaultCashAccount?._id || cfg.defaultCashAccount,
    cfg.defaultCardClearingAccount?._id || cfg.defaultCardClearingAccount,
    ...(cfg.paymentMethodAccounts || []).map(p => p.account?._id || p.account)
  ].filter(Boolean);

  const match = { 
    organization: organizationId,
    "lines.account": { $in: cashAccounts }
  };
  if (start || end) {
    match.entryDate = {};
    if (start) match.entryDate.$gte = new Date(start);
    if (end) match.entryDate.$lte = new Date(end);
  }
  if (locationId) {
    match.location = new mongoose.Types.ObjectId(String(locationId));
  }

  const cc = costCenter != null ? String(costCenter).trim() : "";
  const pipeline = [
    { $match: match },
    { $unwind: "$lines" },
    { $match: { "lines.account": { $in: cashAccounts } } },
  ];
  if (cc) {
    pipeline.push({ $match: { "lines.analytics.costCenter": cc } });
  }
  pipeline.push({
    $group: {
      _id: "$cashFlowCategory",
      netAmount: { $sum: { $subtract: ["$lines.debit", "$lines.credit"] } },
    },
  });

  const results = await JournalEntry.aggregate(pipeline);
  
  const report = {
    operating: 0,
    investing: 0,
    financing: 0,
    none: 0,
    netChange: 0
  };

  for (const r of results) {
    const cat = r._id || "none";
    if (Object.prototype.hasOwnProperty.call(report, cat)) {
      report[cat] = round2(r.netAmount);
    }
  }

  report.netChange = round2(report.operating + report.investing + report.financing + report.none);

  return {
    period: { start: start || null, end: end || null },
    locationId: locationId || null,
    costCenter: cc || null,
    categories: report,
  };
}

async function profitAndLoss({ start, end, organizationId, locationId, costCenter }) {
  const tb = await trialBalance({ start, end, organizationId, locationId, costCenter });
  const agg = aggregateByType(tb);
  const cogs = await cogsFromJournalSources({
    start,
    end,
    organizationId,
    locationId,
    costCenter,
  });
  const cc = costCenter != null ? String(costCenter).trim() : "";
  const revenue = agg.revenue;
  const grossProfit = round2(revenue - cogs);
  const grossMarginPercent =
    revenue > 0 ? round2((grossProfit / revenue) * 100) : null;
  const netMarginPercent =
    revenue > 0 ? round2((agg.netOperating / revenue) * 100) : null;
  return {
    period: { start: start || null, end: end || null },
    locationId: locationId || null,
    costCenter: cc || null,
    revenue,
    expense: agg.expense,
    cogs,
    grossProfit,
    grossMarginPercent,
    netMarginPercent,
    netOperating: agg.netOperating,
    sourceOfTruth: "journal_entries_only",
    trialBalance: tb,
  };
}

async function balanceSheet({ asOf, organizationId, locationId, costCenter }) {
  const tb = await trialBalance({ end: asOf, organizationId, locationId, costCenter });
  const agg = aggregateByType(tb);
  const totalAssets = round2(
    agg.assets.reduce((s, r) => s + r.netBalance, 0)
  );
  const totalLiab = round2(
    agg.liabilities.reduce((s, r) => s + r.netBalance, 0)
  );
  const totalEquity = round2(
    agg.equity.reduce((s, r) => s + r.netBalance, 0)
  );
  const cc = costCenter != null ? String(costCenter).trim() : "";
  return {
    asOf: asOf || null,
    locationId: locationId || null,
    costCenter: cc || null,
    totalAssets,
    totalLiabilities: totalLiab,
    totalEquity,
    assets: agg.assets,
    liabilities: agg.liabilities,
    equity: agg.equity,
    trialBalance: tb,
  };
}

/**
 * V1 consolidated TB: per-org trial balances merged by account `code` (assumes aligned COA across entities).
 * @param {{ start?: string; end?: string; costCenter?: string; childOrganizationIds: import("mongoose").Types.ObjectId[] }} params
 */
async function consolidatedTrialBalance({
  start,
  end,
  costCenter,
  childOrganizationIds,
}) {
  const ids = (childOrganizationIds || [])
    .map((id) =>
      mongoose.Types.ObjectId.isValid(id)
        ? new mongoose.Types.ObjectId(String(id))
        : null
    )
    .filter(Boolean);
  if (ids.length === 0) {
    throw new Error("consolidatedTrialBalance: at least one child organization id is required");
  }
  const cc = costCenter != null ? String(costCenter).trim() : "";
  /** @type {Map<string, { accountId: unknown; code?: string; name?: string; type?: string; debit: number; credit: number; balance: number }>} */
  const merged = new Map();
  for (const oid of ids) {
    const tb = await trialBalance({
      start,
      end,
      organizationId: oid,
      costCenter: cc || undefined,
    });
    for (const r of tb.rows) {
      const key =
        r.code != null && String(r.code).trim() !== ""
          ? String(r.code).trim()
          : String(r.accountId);
      const cur =
        merged.get(key) || {
          accountId: r.accountId,
          code: r.code,
          name: r.name,
          type: r.type,
          debit: 0,
          credit: 0,
          balance: 0,
        };
      cur.debit = round2(cur.debit + r.debit);
      cur.credit = round2(cur.credit + r.credit);
      cur.balance = round2(cur.debit - cur.credit);
      merged.set(key, cur);
    }
  }
  const rows = Array.from(merged.values()).sort((a, b) =>
    String(a.code || "").localeCompare(String(b.code || ""))
  );
  const totalDebit = round2(rows.reduce((s, r) => s + r.debit, 0));
  const totalCredit = round2(rows.reduce((s, r) => s + r.credit, 0));
  return {
    rows,
    totalDebit,
    totalCredit,
    balanced: totalDebit === totalCredit,
    childOrganizationIds: ids,
    costCenter: cc || null,
  };
}

/**
 * @param {{ start?: string; end?: string; costCenter?: string; childOrganizationIds: import("mongoose").Types.ObjectId[] }} params
 */
async function consolidatedProfitAndLoss(params) {
  const tb = await consolidatedTrialBalance(params);
  const agg = aggregateByType(tb);
  const cc = params.costCenter != null ? String(params.costCenter).trim() : "";
  return {
    period: { start: params.start || null, end: params.end || null },
    costCenter: cc || null,
    revenue: agg.revenue,
    expense: agg.expense,
    cogs: agg.cogs,
    netOperating: agg.netOperating,
    trialBalance: tb,
    childOrganizationIds: tb.childOrganizationIds,
  };
}

/**
 * @param {{ asOf?: string; costCenter?: string; childOrganizationIds: import("mongoose").Types.ObjectId[] }} params
 */
async function consolidatedBalanceSheet({ asOf, costCenter, childOrganizationIds }) {
  const tb = await consolidatedTrialBalance({
    end: asOf,
    childOrganizationIds,
    costCenter,
  });
  const agg = aggregateByType(tb);
  const totalAssets = round2(agg.assets.reduce((s, r) => s + r.netBalance, 0));
  const totalLiab = round2(agg.liabilities.reduce((s, r) => s + r.netBalance, 0));
  const totalEquity = round2(agg.equity.reduce((s, r) => s + r.netBalance, 0));
  const cc = costCenter != null ? String(costCenter).trim() : "";
  return {
    asOf: asOf || null,
    costCenter: cc || null,
    totalAssets,
    totalLiabilities: totalLiab,
    totalEquity,
    assets: agg.assets,
    liabilities: agg.liabilities,
    equity: agg.equity,
    trialBalance: tb,
    childOrganizationIds: tb.childOrganizationIds,
  };
}

async function openSession({
  userId,
  openingFloat = 0,
  locationId = null,
  organizationId,
}) {
  if (!organizationId) throw new Error("openSession: organizationId is required");
  const open = await AccountingSession.findOne({
    organization: organizationId,
    status: "open",
  });
  if (open) {
    const err = new Error("An accounting session is already open.");
    err.status = 400;
    throw err;
  }
  const sessionNumber = await nextSequence(
    "accountingSession",
    organizationId
  );
  return AccountingSession.create({
    organization: organizationId,
    sessionNumber,
    status: "open",
    openedBy: userId || null,
    openingFloat: round2(openingFloat),
    location: locationId && mongoose.Types.ObjectId.isValid(locationId)
      ? locationId
      : null,
  });
}

async function closeSession({
  sessionId,
  userId,
  closingCountedCash,
  expectedCash,
  discrepancyNote,
  partialCashCounted,
}) {
  if (!mongoose.Types.ObjectId.isValid(sessionId)) {
    const err = new Error("Invalid session id");
    err.status = 400;
    throw err;
  }
  const sess = await AccountingSession.findById(sessionId);
  if (!sess || sess.status !== "open") {
    const err = new Error("Session not found or already closed.");
    err.status = 404;
    throw err;
  }
  const orgId = sess.organization;
  if (!orgId) throw new Error("Session missing organization.");

  const counted = round2(closingCountedCash);
  const expected =
    expectedCash != null ? round2(expectedCash) : round2(sess.openingFloat);
  const disc = round2(counted - expected);

  const cfg = await getConfig(orgId);
  const cashAcc = cfg.defaultCashAccount?._id || cfg.defaultCashAccount;
  const overShort = await AccountingAccount.findOne({
    organization: orgId,
    code: "5900",
  });

  const lines = [];
  if (Math.abs(disc) > 0.001 && overShort) {
    if (disc < 0) {
      lines.push({
        account: overShort._id,
        debit: round2(-disc),
        credit: 0,
        memo: "Cash short",
      });
      lines.push({
        account: cashAcc,
        debit: 0,
        credit: round2(-disc),
        memo: "Cash short offset",
      });
    } else {
      lines.push({
        account: cashAcc,
        debit: disc,
        credit: 0,
        memo: "Cash over",
      });
      lines.push({
        account: overShort._id,
        debit: 0,
        credit: disc,
        memo: "Cash over offset",
      });
    }
  }

  let closeJe = null;
  if (lines.length) {
    await assertPostingAllowedForDate(new Date(), orgId);
    const entryNumber = await nextSequence("journalEntry", orgId);
    closeJe = await JournalEntry.create({
      organization: orgId,
      entryNumber,
      entryDate: new Date(),
      memo: `Session ${sess.sessionNumber} close cash count`,
      sourceType: "session_close",
      sourceId: sess._id,
      session: sess._id,
      createdBy: userId || null,
      lines,
    });
    await writeAudit("journal.session_close", closeJe, { userId }, orgId);
  }

  sess.status = "closed";
  sess.closedAt = new Date();
  sess.closedBy = userId || null;
  sess.closingCountedCash = counted;
  sess.expectedCash = expected;
  sess.discrepancy = disc;
  let note = discrepancyNote || "";
  if (
    partialCashCounted != null &&
    partialCashCounted !== "" &&
    !Number.isNaN(Number(partialCashCounted))
  ) {
    note = `${note} [partial drawer count ${Number(partialCashCounted)}]`.trim();
  }
  sess.discrepancyNote = note;
  if (closeJe) sess.closeJournalEntry = closeJe._id;
  const logEntry = {
    at: new Date(),
    actor: userId || null,
    countedCash: counted,
    expectedCash: expected,
    variance: disc,
    note: note.slice(0, 2000),
  };
  sess.cashReconciliationLog = [...(sess.cashReconciliationLog || []), logEntry];
  await sess.save();
  return { session: sess, journalEntry: closeJe };
}

async function listAccountingPeriods(organizationId) {
  if (!organizationId) {
    throw new Error("listAccountingPeriods: organizationId is required");
  }
  return AccountingPeriod.find({ organization: organizationId })
    .sort({ year: -1, month: -1 })
    .limit(120)
    .lean();
}

async function closeAccountingPeriod({ year, month, userId, organizationId }) {
  const y = Number(year);
  const m = Number(month);
  if (!y || m < 1 || m > 12) throw new Error("Invalid year/month");
  if (!organizationId) throw new Error("organizationId is required");

  // Check if already closed
  const existing = await AccountingPeriod.findOne({
    year: y,
    month: m,
    organization: organizationId,
  });
  if (existing && existing.status === "closed") {
    throw new Error(`Period ${y}-${String(m).padStart(2, "0")} is already closed.`);
  }

  // Check for open sessions in this period
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));

  const openSessions = await AccountingSession.exists({
    organization: organizationId,
    status: "open",
    openedAt: { $gte: start, $lte: end },
  });

  if (openSessions) {
    throw new Error("Cannot close period: One or more sessions are still open in this timeframe.");
  }

  return AccountingPeriod.findOneAndUpdate(
    { year: y, month: m, organization: organizationId },
    {
      $set: {
        status: "closed",
        closedAt: new Date(),
        closedBy: userId || null,
      },
      $setOnInsert: {
        organization: organizationId,
        year: y,
        month: m,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();
}

async function issueInvoiceFromOrder({ orderId, dueDays = 30 }) {
  const oid = mongoose.Types.ObjectId.isValid(orderId)
    ? new mongoose.Types.ObjectId(orderId)
    : null;
  if (!oid) throw new Error("Invalid order id");

  const order = await Order.findById(oid);
  if (!order) throw new Error("Order not found");
  if (!order.customer) throw new Error("Order has no customer");
  const orgId = order.organization;
  if (!orgId) throw new Error("Order has no organization for invoicing.");

  const n = await nextSequence("invoiceNumber", orgId);
  const invNum = `INV-${String(n).padStart(6, "0")}`;
  const sub = round2(order.bills?.total ?? 0);
  const tax = round2(order.bills?.tax ?? 0);
  const serviceCharge = round2(order.bills?.serviceChargeAmount ?? 0);
  const total = round2(order.bills?.totalWithTax ?? sub + tax + serviceCharge);
  const issue = order.paidAt || new Date();
  const due = new Date(issue);
  due.setUTCDate(due.getUTCDate() + Number(dueDays) || 30);

  const taxLines = (order.bills?.taxLines || []).map((t) => ({
    code: t.code,
    label: t.label || t.code,
    amount: round2(t.amount),
  }));

  // Fallback: if tax > 0 but no taxLines, create a generic entry
  if (taxLines.length === 0 && tax > 0) {
    taxLines.push({
      code: "TAX",
      label: "Tax",
      amount: tax,
    });
  }

  return AccountingInvoice.create({
    organization: orgId,
    invoiceNumber: invNum,
    customer: order.customer,
    order: order._id,
    status: "posted",
    issueDate: issue,
    dueDate: due,
    currency: order.documentCurrency || "USD",
    subtotal: sub,
    tax,
    serviceCharge,
    total,
    amountPaid: 0,
    taxDetails: taxLines,
  });
}

async function listAccountingInvoices({
  status,
  customerId,
  limit = 100,
  organizationId,
} = {}) {
  if (!organizationId) {
    throw new Error("listAccountingInvoices: organizationId is required");
  }
  const q = { organization: organizationId };
  if (status) q.status = status;
  if (customerId && mongoose.Types.ObjectId.isValid(customerId)) {
    q.customer = customerId;
  }
  return AccountingInvoice.find(q)
    .sort({ issueDate: -1 })
    .limit(Math.min(Number(limit) || 100, 500))
    .populate("customer", "name phone")
    .populate("order", "orderStatus bills")
    .lean();
}

async function voidAccountingInvoice(invoiceId, organizationId) {
  if (!mongoose.Types.ObjectId.isValid(invoiceId)) {
    throw new Error("Invalid invoice id");
  }
  if (!organizationId) throw new Error("organizationId is required");
  const inv = await AccountingInvoice.findOne({
    _id: invoiceId,
    organization: organizationId,
  });
  if (!inv) throw new Error("Invoice not found");
  if (inv.status === "void") return inv;
  inv.status = "void";
  await inv.save();
  return inv;
}

async function arAgingReport({ asOf, organizationId } = {}) {
  if (!organizationId) {
    throw new Error("arAgingReport: organizationId is required");
  }
  const as = asOf ? new Date(asOf) : new Date();
  const invoices = await AccountingInvoice.find({
    organization: organizationId,
    status: { $in: ["posted", "open", "partial"] },
  })
    .populate("customer", "name")
    .sort({ dueDate: 1 })
    .lean();

  const buckets = {
    current: 0,
    days1to30: 0,
    days31to60: 0,
    days61to90: 0,
    over90: 0,
  };
  const rows = [];

  for (const inv of invoices) {
    const owed = round2(Number(inv.total) - Number(inv.amountPaid || 0));
    if (owed <= 0) continue;
    const due = new Date(inv.dueDate);
    const days = Math.floor((as - due) / 86400000);
    if (days <= 0) buckets.current = round2(buckets.current + owed);
    else if (days <= 30) buckets.days1to30 = round2(buckets.days1to30 + owed);
    else if (days <= 60) buckets.days31to60 = round2(buckets.days31to60 + owed);
    else if (days <= 90) buckets.days61to90 = round2(buckets.days61to90 + owed);
    else buckets.over90 = round2(buckets.over90 + owed);

    rows.push({
      invoiceId: inv._id,
      invoiceNumber: inv.invoiceNumber,
      customerId: inv.customer?._id,
      customerName: inv.customer?.name,
      dueDate: inv.dueDate,
      amountDue: owed,
      daysPastDue: Math.max(0, days),
    });
  }

  return { asOf: as, buckets, invoices: rows };
}

/**
 * Customer AR statement: open invoices, balances, and invoice history for a date range.
 * @param {{ customerId: string; organizationId: unknown; start?: string|Date; end?: string|Date }}} params
 */
async function buildCustomerStatement({ customerId, organizationId, start, end }) {
  if (!organizationId) throw new Error("buildCustomerStatement: organizationId is required");
  if (!mongoose.Types.ObjectId.isValid(customerId)) {
    throw new Error("Invalid customer id");
  }
  const cid = new mongoose.Types.ObjectId(customerId);
  const cust = await Customer.findOne({
    _id: cid,
    organization: organizationId,
  })
    .select("name email phone arBalance unappliedCredit")
    .lean();
  if (!cust) throw new Error("Customer not found");

  const cfg = await getConfig(organizationId);
  const currency = String(cfg?.companyCurrency || "USD").toUpperCase();

  const invQ = {
    organization: organizationId,
    customer: cid,
    status: { $ne: "void" },
  };
  if (start || end) {
    invQ.issueDate = {};
    if (start) invQ.issueDate.$gte = new Date(start);
    if (end) invQ.issueDate.$lte = new Date(end);
  }

  const invoices = await AccountingInvoice.find(invQ)
    .sort({ issueDate: -1 })
    .select(
      "invoiceNumber status issueDate dueDate subtotal tax total amountPaid currency order"
    )
    .lean();

  const openInvoices = [];
  let totalOpen = 0;
  for (const inv of invoices) {
    const due = round2(Number(inv.total) - Number(inv.amountPaid || 0));
    if (due > 0.001 && ["posted", "open", "partial"].includes(String(inv.status))) {
      openInvoices.push({
        invoiceId: inv._id,
        invoiceNumber: inv.invoiceNumber,
        issueDate: inv.issueDate,
        dueDate: inv.dueDate,
        status: inv.status,
        total: round2(Number(inv.total)),
        amountPaid: round2(Number(inv.amountPaid || 0)),
        amountDue: due,
      });
      totalOpen = round2(totalOpen + due);
    }
  }

  return {
    asOf: new Date().toISOString(),
    currency,
    customer: {
      id: cust._id,
      name: cust.name,
      email: cust.email || "",
      phone: cust.phone || "",
      arBalance: round2(Number(cust.arBalance || 0)),
      unappliedCredit: round2(Number(cust.unappliedCredit || 0)),
    },
    openInvoices,
    totalOpenAmount: totalOpen,
    invoices: invoices.map((inv) => ({
      invoiceId: inv._id,
      invoiceNumber: inv.invoiceNumber,
      status: inv.status,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      subtotal: round2(Number(inv.subtotal || 0)),
      tax: round2(Number(inv.tax || 0)),
      total: round2(Number(inv.total)),
      amountPaid: round2(Number(inv.amountPaid || 0)),
      amountDue: round2(Number(inv.total) - Number(inv.amountPaid || 0)),
    })),
  };
}

/**
 * Supplier AP statement: vendor bills and balances for one supplier.
 * @param {{ supplierId: string; organizationId: unknown; start?: string|Date; end?: string|Date }}} params
 */
async function buildSupplierStatement({ supplierId, organizationId, start, end }) {
  if (!organizationId) throw new Error("buildSupplierStatement: organizationId is required");
  if (!mongoose.Types.ObjectId.isValid(supplierId)) {
    throw new Error("Invalid supplier id");
  }
  const sid = new mongoose.Types.ObjectId(supplierId);
  const Supplier = require("../models/supplierModel");
  const sup = await Supplier.findOne({
    _id: sid,
    organization: organizationId,
  })
    .select("name code email phone")
    .lean();
  if (!sup) throw new Error("Supplier not found");

  const cfg = await getConfig(organizationId);
  const currency = String(cfg?.companyCurrency || "USD").toUpperCase();

  const billQ = {
    organization: organizationId,
    supplier: sid,
    status: { $ne: "void" },
  };
  if (start || end) {
    billQ.billDate = {};
    if (start) billQ.billDate.$gte = new Date(start);
    if (end) billQ.billDate.$lte = new Date(end);
  }

  const bills = await VendorBill.find(billQ)
    .sort({ billDate: -1 })
    .select(
      "vendorBillNumber status billDate dueDate subtotal tax total amountPaid currency journalEntry"
    )
    .lean();

  const openBills = [];
  let totalOpen = 0;
  for (const b of bills) {
    const due = round2(Number(b.total) - Number(b.amountPaid || 0));
    if (due > 0.001 && ["posted", "partial"].includes(String(b.status))) {
      openBills.push({
        vendorBillId: b._id,
        vendorBillNumber: b.vendorBillNumber,
        billDate: b.billDate,
        dueDate: b.dueDate,
        status: b.status,
        total: round2(Number(b.total)),
        amountPaid: round2(Number(b.amountPaid || 0)),
        amountDue: due,
      });
      totalOpen = round2(totalOpen + due);
    }
  }

  return {
    asOf: new Date().toISOString(),
    currency,
    supplier: {
      id: sup._id,
      name: sup.name,
      code: sup.code || "",
      email: sup.email || "",
      phone: sup.phone || "",
    },
    openBills,
    totalOpenAmount: totalOpen,
    bills: bills.map((b) => ({
      vendorBillId: b._id,
      vendorBillNumber: b.vendorBillNumber,
      status: b.status,
      billDate: b.billDate,
      dueDate: b.dueDate,
      subtotal: round2(Number(b.subtotal || 0)),
      tax: round2(Number(b.tax || 0)),
      total: round2(Number(b.total)),
      amountPaid: round2(Number(b.amountPaid || 0)),
      amountDue: round2(Number(b.total) - Number(b.amountPaid || 0)),
    })),
  };
}

async function postClosingToRetainedEarnings({
  endDate,
  userId,
  idempotencyKey,
  organizationId,
}) {
  if (!organizationId) throw new Error("organizationId is required");
  await ensureDefaultAccountsAndConfig(organizationId);
  const cfgDoc = await getConfig(organizationId);
  const reAcc =
    cfgDoc.retainedEarningsAccount?._id || cfgDoc.retainedEarningsAccount;
  if (!reAcc) throw new Error("Configure retained earnings account.");

  const ed = endDate ? new Date(endDate) : new Date();
  await assertPostingAllowedForDate(ed, organizationId);

  const tb = await trialBalance({ end: endDate, organizationId });
  const lines = [];
  let totalRevClose = 0;
  let totalExpClose = 0;

  for (const r of tb.rows) {
    if (r.type === "revenue") {
      const netCr = round2(r.credit - r.debit);
      if (netCr > 0) {
        lines.push({
          account: r.accountId,
          debit: netCr,
          credit: 0,
          memo: "Close revenue",
        });
        totalRevClose = round2(totalRevClose + netCr);
      }
    } else if (r.type === "expense") {
      const netDr = round2(r.debit - r.credit);
      if (netDr > 0) {
        lines.push({
          account: r.accountId,
          debit: 0,
          credit: netDr,
          memo: "Close expense",
        });
        totalExpClose = round2(totalExpClose + netDr);
      }
    }
  }

  const ni = round2(totalRevClose - totalExpClose);
  if (ni > 0) {
    lines.push({
      account: reAcc,
      debit: 0,
      credit: ni,
      memo: "Net income to retained earnings",
    });
  } else if (ni < 0) {
    lines.push({
      account: reAcc,
      debit: round2(-ni),
      credit: 0,
      memo: "Net loss to retained earnings",
    });
  }

  if (lines.length === 0) return null;

  const sid = new mongoose.Types.ObjectId();
  const iKey =
    idempotencyKey ||
    `close-re:${endDate ? new Date(endDate).toISOString().slice(0, 10) : "all"}`;

  const { entry } = await createJournalEntry(
    {
      organization: organizationId,
      entryDate: ed,
      memo: `Closing to retained earnings (through ${ed.toISOString().slice(0, 10)})`,
      sourceType: "period_close",
      sourceId: sid,
      createdBy: userId || null,
      companyCurrency: cfgDoc.companyCurrency || "USD",
      lines,
    },
    { idempotencyKey: iKey, userId, auditAction: "journal.period_close" }
  );
  return entry;
}

async function acknowledgeSyncBatch({
  batchId,
  orderIds,
  userId,
  note,
  organizationId,
}) {
  if (!batchId || !String(batchId).trim()) throw new Error("batchId required");
  if (!organizationId) throw new Error("organizationId is required");
  const AccountingSyncLog = require("../models/accountingSyncLogModel");
  const existing = await AccountingSyncLog.findOne({
    organization: organizationId,
    batchId: String(batchId),
  });
  if (existing) return { log: existing, reused: true };

  const oids = (orderIds || [])
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  const log = await AccountingSyncLog.create({
    organization: organizationId,
    batchId: String(batchId).trim(),
    orderIds: oids,
    user: userId || null,
    note: note || "",
  });
  await writeAudit(
    "sync.batch_ack",
    null,
    {
      userId,
      payload: { batchId, count: oids.length },
    },
    organizationId
  );
  return { log, reused: false };
}

function randomGiftCode() {
  const n = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `GC-${n}`;
}

async function issueGiftCard({
  amount,
  userId,
  cashAccountId,
  idempotencyKey,
  organizationId,
}) {
  const amt = round2(amount);
  if (amt <= 0) throw new Error("Amount must be positive");
  if (!organizationId) throw new Error("organizationId is required");
  await ensureDefaultAccountsAndConfig(organizationId);
  const cfg = await getConfig(organizationId);
  const cash =
    cashAccountId || cfg.defaultCashAccount?._id || cfg.defaultCashAccount;
  const liab =
    cfg.defaultGiftCardLiabilityAccount?._id ||
    cfg.defaultGiftCardLiabilityAccount;
  if (!cash || !liab) {
    throw new Error("Configure cash and gift card liability accounts.");
  }
  const code = randomGiftCode();
  const iKey = idempotencyKey || `gc-issue:${code}:${amt}`;
  const sid = new mongoose.Types.ObjectId();
  const { entry, reused } = await createJournalEntry(
    {
      organization: organizationId,
      entryDate: new Date(),
      memo: `Gift card issued ${code}`,
      sourceType: "gift_card_issue",
      sourceId: sid,
      createdBy: userId || null,
      companyCurrency: cfg.companyCurrency || "USD",
      lines: [
        { account: cash, debit: amt, credit: 0, memo: "Cash in" },
        { account: liab, debit: 0, credit: amt, memo: "Gift card liability" },
      ],
      metadata: { giftCardCode: code },
    },
    { idempotencyKey: iKey, userId, auditAction: "journal.gift_card_issue" }
  );
  if (!reused) {
    await GiftCard.create({
      code,
      balance: amt,
      initialAmount: amt,
      organization: organizationId,
      status: "active",
    });
  }
  const finalCode = entry.metadata?.giftCardCode || code;
  return { code: finalCode, entry };
}

async function listGiftCards({ organizationId, status, limit = 100, skip = 0 }) {
  if (!organizationId) throw new Error("organizationId is required");
  const query = { organization: organizationId };
  if (status) query.status = status;
  const cap = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const offset = Math.max(Number(skip) || 0, 0);
  const [items, total] = await Promise.all([
    GiftCard.find(query).sort({ createdAt: -1 }).skip(offset).limit(cap).lean(),
    GiftCard.countDocuments(query),
  ]);
  return { items, total, limit: cap, skip: offset };
}

async function redeemGiftCard({
  code,
  amount,
  userId,
  idempotencyKey,
  organizationId,
}) {
  const amt = round2(amount);
  if (amt <= 0) throw new Error("Amount must be positive");
  if (!organizationId) throw new Error("organizationId is required");
  const gc = await GiftCard.findOne({
    code: String(code || "").trim().toUpperCase(),
  });
  if (!gc) throw new Error("Gift card not found");
  if (gc.balance + 0.001 < amt) throw new Error("Insufficient gift card balance");
  const cfg = await getConfig(organizationId);
  const liab =
    cfg.defaultGiftCardLiabilityAccount?._id ||
    cfg.defaultGiftCardLiabilityAccount;
  const rev = cfg.defaultRevenueAccount?._id || cfg.defaultRevenueAccount;
  if (!liab || !rev) throw new Error("Configure liability and revenue accounts.");
  const sid = new mongoose.Types.ObjectId();
  const iKey =
    idempotencyKey || `gc-redeem:${gc.code}:${amt}:${Date.now()}`;
  const { entry, reused } = await createJournalEntry(
    {
      organization: organizationId,
      entryDate: new Date(),
      memo: `Gift card redeem ${gc.code}`,
      sourceType: "gift_card_redeem",
      sourceId: sid,
      createdBy: userId || null,
      companyCurrency: cfg.companyCurrency || "USD",
      lines: [
        { account: liab, debit: amt, credit: 0, memo: "Liability release" },
        { account: rev, debit: 0, credit: amt, memo: "Gift card revenue" },
      ],
      metadata: { giftCardCode: gc.code },
    },
    { idempotencyKey: iKey, userId, auditAction: "journal.gift_card_redeem" }
  );
  if (!reused) {
    gc.balance = round2(gc.balance - amt);
    gc.lastRedeemedAt = new Date();
    if (gc.balance <= 0.001) gc.status = "redeemed";
    if (!gc.organization) gc.organization = organizationId;
    await gc.save();
  }
  return { entry };
}

async function sessionSummaryReport({ sessionId, organizationId }) {
  if (!mongoose.Types.ObjectId.isValid(sessionId)) {
    throw new Error("Invalid session id");
  }
  if (!organizationId) throw new Error("organizationId is required");
  const sess = await AccountingSession.findOne({
    _id: sessionId,
    organization: organizationId,
  }).lean();
  if (!sess) throw new Error("Session not found");
  const entries = await JournalEntry.find({
    session: sessionId,
    organization: organizationId,
  })
    .populate("lines.account", "code name")
    .sort({ entryDate: 1 })
    .lean();
  return { session: sess, journalEntries: entries };
}

async function listBankStatementLines() {
  const BankStatementLine = require("../models/bankStatementLineModel");
  return BankStatementLine.find().sort({ postedAt: -1 }).limit(200).lean();
}

function journalsToCsvRows(entries) {
  const lines = [
    "entryNumber,entryDate,sourceType,memo,accountCode,accountName,debit,credit,orderId,idempotencyKey,tableNo,grossPreDiscount,discountTotal,discountPct,manualDiscount,loyaltyDiscount",
  ];
  for (const e of entries) {
    const base = `${e.entryNumber},${(e.entryDate && new Date(e.entryDate).toISOString()) || ""},${e.sourceType},"${(e.memo || "").replace(/"/g, '""')}"`;
    const m = e.metadata && typeof e.metadata === "object" ? e.metadata : {};
    const csvMeta = [
      m.tableNo != null && m.tableNo !== "" ? m.tableNo : "",
      m.grossPreDiscount != null ? m.grossPreDiscount : "",
      m.discountTotal != null ? m.discountTotal : m.discount != null ? m.discount : "",
      m.discountPercentOfGross != null ? m.discountPercentOfGross : "",
      m.manualDiscountAmount != null ? m.manualDiscountAmount : "",
      m.loyaltyDiscountAmount != null ? m.loyaltyDiscountAmount : "",
    ].join(",");
    for (const l of e.lines || []) {
      const acc = l.account;
      const code = acc && typeof acc === "object" ? acc.code : "";
      const name = acc && typeof acc === "object" ? acc.name : "";
      lines.push(
        `${base},${code},"${(name || "").replace(/"/g, '""')}",${l.debit || 0},${l.credit || 0},${e.order || ""},${e.idempotencyKey || ""},${csvMeta}`
      );
    }
  }
  return lines.join("\n");
}

module.exports = {
  round2,
  normalizeOrderStatus,
  buildOrderSaleRevenueCategoryMix,
  nextSequence,
  ensureDefaultAccountsAndConfig,
  bootstrapBranchAccounts,
  getConfig,
  resolveTenderAccount,
  resolveFxRateFromTable,
  postOrderSaleLedger,
  postOrderCogsLedger,
  reverseOrderSaleLedger,
  reverseOrderCogsLedger,
  postOrderRefund,
  postPartialCogsRefund,
  postArPayment,
  onOrderBecamePaid,
  accountingPostingFromOrder,
  trialBalance,
  profitAndLoss,
  balanceSheet,
  openSession,
  closeSession,
  acknowledgeSyncBatch,
  journalsToCsvRows,
  createJournalEntry,
  postStockTakeJournalEntry,
  computeOrderCogsCost,
  computeStandardCogsCostFromOrder,
  sumCostAmountForOrder,
  assertPostingAllowedForDate,
  listAccountingPeriods,
  closeAccountingPeriod,
  issueInvoiceFromOrder,
  listAccountingInvoices,
  voidAccountingInvoice,
  arAgingReport,
  buildCustomerStatement,
  buildSupplierStatement,
  consolidatedTrialBalance,
  consolidatedProfitAndLoss,
  consolidatedBalanceSheet,
  postClosingToRetainedEarnings,
  issueGiftCard,
  redeemGiftCard,
  listGiftCards,
  sessionSummaryReport,
  listBankStatementLines,
};

/**
 * Enforce maker–checker when org config requires an approved `ApprovalRequest` for the target document.
 * @param {import("mongoose").Types.ObjectId|string} organizationId
 * @param {string} targetType
 * @param {import("mongoose").Types.ObjectId|string} targetId
 */
async function assertApprovedApprovalRequestExists(organizationId, targetType, targetId) {
  const tid = mongoose.Types.ObjectId.isValid(targetId)
    ? new mongoose.Types.ObjectId(String(targetId))
    : null;
  if (!tid) {
    const err = new Error("Invalid target id for approval check.");
    err.status = 400;
    throw err;
  }
  const ar = await ApprovalRequest.findOne({
    organization: organizationId,
    targetType,
    targetId: tid,
    status: "approved",
  }).lean();
  if (!ar) {
    const err = new Error(
      `An approved approval request is required for this ${String(targetType).replace(/_/g, " ")} before posting.`
    );
    err.status = 400;
    throw err;
  }
}

/**
 * GL for confirmed vendor return (RTV): debit AP, credit inventory at consumed cost.
 * Idempotent per vendor return id. Call inside a Mongo transaction with stock/cost moves.
 *
 * @param {{
 *   vendorReturnId: import("mongoose").Types.ObjectId|string;
 *   organizationId: import("mongoose").Types.ObjectId|string;
 *   totalCost: number;
 *   returnDate?: Date;
 *   returnNumber?: string;
 *   userId?: import("mongoose").Types.ObjectId|null;
 *   locationId?: import("mongoose").Types.ObjectId|string|null;
 *   session?: import("mongoose").ClientSession|null;
 * }} params
 * @returns {Promise<import("mongoose").Document|null>}
 */
async function postVendorReturnGl({
  vendorReturnId,
  organizationId,
  totalCost,
  returnDate,
  returnNumber,
  userId,
  locationId,
  session,
}) {
  const rid = mongoose.Types.ObjectId.isValid(vendorReturnId)
    ? new mongoose.Types.ObjectId(vendorReturnId)
    : null;
  if (!rid) throw new Error("Invalid vendor return id");
  const amt = round2(Number(totalCost) || 0);
  if (amt <= 0.001) return null;

  const orgOid = mongoose.Types.ObjectId.isValid(organizationId)
    ? new mongoose.Types.ObjectId(organizationId)
    : null;
  if (!orgOid) throw new Error("organizationId is required");

  const cfg = await getConfig(orgOid);
  const ap =
    cfg.defaultAccountsPayableAccount?._id || cfg.defaultAccountsPayableAccount;
  const inv =
    cfg.defaultInventoryAssetAccount?._id ||
    cfg.defaultInventoryAssetAccount ||
    (await AccountingAccount.findOne({ organization: orgOid, code: "1200" }))?._id;
  if (!ap || !inv) {
    throw new Error("Configure accounts payable and inventory asset accounts for vendor return GL.");
  }

  const iKey = `vendor_return_gl:${String(rid)}`;
  const dupQ = JournalEntry.findOne({
    organization: orgOid,
    idempotencyKey: iKey,
  });
  if (session) dupQ.session(session);
  const hit = await dupQ;
  if (hit) return hit;

  const { entry } = await createJournalEntry(
    {
      organization: orgOid,
      entryDate: returnDate ? new Date(returnDate) : new Date(),
      memo: `Vendor return ${returnNumber || String(rid).slice(-8)}`,
      sourceType: "vendor_return_gl",
      sourceId: rid,
      location: locationId || null,
      createdBy: userId || null,
      companyCurrency: cfg.companyCurrency || "USD",
      metadata: { vendorReturnId: String(rid), totalCost: amt },
      lines: [
        {
          account: ap,
          debit: amt,
          credit: 0,
          memo: "Reduce AP (goods returned to supplier)",
        },
        {
          account: inv,
          debit: 0,
          credit: amt,
          memo: "Inventory reduction (RTV at cost)",
        },
      ],
    },
    {
      idempotencyKey: iKey,
      userId,
      auditAction: "journal.vendor_return",
      session: session || null,
    }
  );

  if (!session) {
    await writeAudit(
      "journal.vendor_return",
      entry,
      {
        idempotencyKey: iKey,
        userId,
        payload: { vendorReturnId: String(rid), totalCost: amt },
      },
      orgOid
    );
  }
  return entry;
}

/**
 * VENDOR BILLS
 */

async function createVendorBillFromPO(purchaseOrderId, data, userId) {
  const po = await PurchaseOrder.findById(purchaseOrderId);
  if (!po) throw new Error("Purchase order not found");
  const orgId = po.organization;
  if (!orgId) throw new Error("Org required");

  const poStatus = String(po.status || "").toLowerCase();
  if (!["partial", "received"].includes(poStatus)) {
    throw new Error(
      "Vendor bills can only be created after goods are received (PO status partial or received)."
    );
  }

  // Multi-tenant sequence for Vendor Bill Numbers
  const seq = await nextSequence("vendorBill", orgId);
  const vendorBillNumber = `VB-${seq.toString().padStart(5, "0")}`;

  const lines = (po.lines || []).map((l) => ({
    itemDescription: l.description || "Ingredient",
    ingredient: l.ingredient,
    quantity: l.quantityReceived || l.quantityOrdered,
    unitPrice: l.unitCost,
    taxAmount: 0, // Simplified: tax to be added manually or from a more complex PO model
    lineTotal: round2((l.quantityReceived || l.quantityOrdered) * l.unitCost),
  }));

  const subtotal = round2(lines.reduce((sum, line) => sum + line.lineTotal, 0));
  const total = subtotal; // Simplified

  const bill = await VendorBill.create({
    organization: orgId,
    vendorBillNumber,
    supplier: po.supplier,
    purchaseOrder: po._id,
    status: "draft",
    billDate: data.billDate || new Date(),
    dueDate: data.dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Default 30 days
    currency: data.currency || "USD",
    subtotal,
    tax: 0,
    total,
    notes: po.notes || "",
    lines,
  });

  po.vendorBill = bill._id;
  await po.save();

  await writeAudit("vendor_bill.created", null, {
    userId,
    payload: { vendorBillId: bill._id, poId: po._id },
  }, orgId);

  return bill;
}

async function postVendorBill(vendorBillId, userId, organizationId = null) {
  const vendorBillFilter = { _id: vendorBillId };
  if (organizationId) vendorBillFilter.organization = organizationId;
  const bill = await VendorBill.findOne(vendorBillFilter).populate("lines.ingredient");
  if (!bill) throw new Error("Vendor bill not found");
  if (bill.status !== "draft") throw new Error("Only draft bills can be posted");

  const orgId = bill.organization;
  const cfg = await getConfig(orgId);
  if (cfg.requireApprovalsForVendorPosting) {
    await assertApprovedApprovalRequestExists(orgId, "vendor_bill", bill._id);
  }
  const apAccount = cfg.defaultAccountsPayableAccount?._id || cfg.defaultAccountsPayableAccount;
  const invAccount =
    cfg.defaultInventoryAssetAccount?._id ||
    cfg.defaultInventoryAssetAccount ||
    (await AccountingAccount.findOne({ organization: orgId, code: "1200" }))?._id;
  const expAccount =
    cfg.defaultPurchasesExpenseAccount?._id ||
    cfg.defaultPurchasesExpenseAccount ||
    (await AccountingAccount.findOne({ organization: orgId, code: "5200" }))?._id;

  const grniAccount = cfg.defaultGrniAccount?._id || cfg.defaultGrniAccount;

  if (!apAccount) throw new Error("Accounts Payable account not configured.");

  const journalLines = [];
  const billCostCenter =
    bill.costCenter != null && String(bill.costCenter).trim() !== ""
      ? String(bill.costCenter).trim()
      : "";

  // Debit sides: per-line resolution
  for (const line of bill.lines) {
    let debitAccount;
    if (bill.purchaseOrder && grniAccount) {
      debitAccount = grniAccount;
    } else {
      debitAccount = line.ingredient ? invAccount : expAccount;
    }

    if (!debitAccount) throw new Error(`Debit account missing for line: ${line.itemDescription}`);

    const lineAnalytics = billCostCenter ? { costCenter: billCostCenter } : undefined;

    journalLines.push({
      account: debitAccount,
      debit: line.lineTotal,
      credit: 0,
      memo: `Bill ${bill.vendorBillNumber}: ${line.itemDescription}`,
      analytics: lineAnalytics,
    });
  }

  // Credit side: Accounts Payable
  journalLines.push({
    account: apAccount,
    debit: 0,
    credit: bill.total,
    memo: `Bill ${bill.vendorBillNumber} liability`,
  });

  const { entry: postedEntry } = await createJournalEntry(
    {
      organization: orgId,
      entryDate: bill.billDate,
      memo: `Posting Vendor Bill ${bill.vendorBillNumber}`,
      sourceType: "vendor_bill",
      sourceId: bill._id,
      createdBy: userId,
      companyCurrency: cfg.companyCurrency,
      lines: journalLines,
    },
    { userId, auditAction: "vendor_bill.posted" }
  );

  bill.status = "posted";
  bill.journalEntry = postedEntry._id;
  bill.postedAt = new Date();
  bill.postedBy = userId || null;
  await bill.save();

  const populated = await VendorBill.findById(bill._id)
    .populate("supplier", "name")
    .populate("purchaseOrder", "reference")
    .populate("lines.ingredient", "name unit sku");

  if (populated.purchaseOrder) {
    try {
      await threeWayMatchService.runThreeWayMatch(populated.purchaseOrder._id, populated._id, orgId);
    } catch (err) {
      console.error("[accountingService] Three-way match failed:", err.message);
    }
  }

  return populated;
}

async function recordVendorBillPayment(
  vendorBillId,
  amount,
  paymentData,
  userId,
  organizationId = null
) {
  const vendorBillFilter = { _id: vendorBillId };
  if (organizationId) vendorBillFilter.organization = organizationId;
  const bill = await VendorBill.findOne(vendorBillFilter);
  if (!bill) throw new Error("Vendor bill not found");
  if (!["posted", "partial"].includes(bill.status)) {
    throw new Error("Bill must be posted or partial to record payment");
  }

  const orgId = bill.organization;
  const cfg = await getConfig(orgId);
  const apAccount = cfg.defaultAccountsPayableAccount?._id || cfg.defaultAccountsPayableAccount;
  const paymentMethod = String(paymentData?.method || "").trim().toLowerCase();
  if (!paymentMethod) throw new Error("payment method is required");
  const cashAccount = resolveTenderAccount(cfg, paymentMethod, null);

  if (!apAccount || !cashAccount) throw new Error("Payment accounts not configured.");

  const amt = round2(amount);
  bill.amountPaid = round2(bill.amountPaid + amt);

  if (bill.amountPaid >= bill.total) {
    bill.status = "paid";
  } else {
    bill.status = "partial";
  }

  await createJournalEntry({
    organization: orgId,
    entryDate: paymentData?.date || new Date(),
    memo: `Payment for bill ${bill.vendorBillNumber}`,
    sourceType: "vendor_bill_payment",
    sourceId: bill._id,
    createdBy: userId,
    companyCurrency: cfg.companyCurrency,
    lines: [
      { account: apAccount, debit: amt, credit: 0, memo: "Payment applied to bill" },
      { account: cashAccount, debit: 0, credit: amt, memo: `Tender ${paymentMethod}` },
    ],
  }, { userId, auditAction: "vendor_bill.payment_recorded" });

  await bill.save();
  return bill;
}

async function voidVendorBill(vendorBillId, userId, organizationId = null) {
  const vendorBillFilter = { _id: vendorBillId };
  if (organizationId) vendorBillFilter.organization = organizationId;
  const bill = await VendorBill.findOne(vendorBillFilter);
  if (!bill) throw new Error("Vendor bill not found");
  if (bill.status === "void") throw new Error("Bill is already void");

  const orgId = bill.organization;
  const latestJournal = await JournalEntry.findOne({
    organization: orgId,
    sourceType: "vendor_bill",
    sourceId: bill._id,
  }).sort({ createdAt: -1 });

  if (latestJournal) {
    // Post reversal
    const reversalLines = latestJournal.lines.map(l => ({
      account: l.account,
      debit: l.credit,
      credit: l.debit,
      memo: `REVERSAL of ${l.memo}`,
    }));

    await createJournalEntry({
      organization: orgId,
      entryDate: new Date(),
      memo: `Voiding Vendor Bill ${bill.vendorBillNumber}`,
      sourceType: "vendor_bill_void",
      sourceId: bill._id,
      createdBy: userId,
      companyCurrency: latestJournal.companyCurrency,
      lines: reversalLines,
    }, { userId, auditAction: "vendor_bill.voided" });
  }

  bill.status = "void";
  await bill.save();

  return bill;
}

/**
 * Post approved expense report: DR expense lines, CR default cash for total. Idempotent per report id.
 * @param {import("mongoose").Types.ObjectId|string} expenseReportId
 * @param {import("mongoose").Types.ObjectId|null|undefined} userId
 */
async function postExpenseReportToGl(expenseReportId, userId) {
  if (!mongoose.Types.ObjectId.isValid(expenseReportId)) {
    throw new Error("Invalid expense report id");
  }
  const rid = new mongoose.Types.ObjectId(String(expenseReportId));
  const report = await ExpenseReport.findById(rid).populate("lines.glAccount", "code name type");
  if (!report) throw new Error("Expense report not found");
  if (report.status !== "approved") {
    throw new Error("Expense report must be approved before posting to GL.");
  }

  const orgId = report.organization;
  const cfg = await getConfig(orgId);
  if (cfg.requireApprovalsForExpensePosting) {
    await assertApprovedApprovalRequestExists(orgId, "expense_report", report._id);
  }

  const iKey = `expense_report:${String(report._id)}`;
  const dup = await JournalEntry.findOne({ organization: orgId, idempotencyKey: iKey });
  if (dup) {
    report.status = "posted";
    report.journalEntry = dup._id;
    await report.save();
    return dup;
  }

  const cash = cfg.defaultCashAccount?._id || cfg.defaultCashAccount;
  if (!cash) {
    throw new Error("Configure default cash account before posting expense reports.");
  }

  const jLines = [];
  let total = 0;
  for (const ln of report.lines || []) {
    const amt = round2(Number(ln.amount) || 0);
    if (amt <= 0) continue;
    const acc = ln.glAccount?._id || ln.glAccount;
    if (!acc) throw new Error("Each expense line needs a GL account.");
    total = round2(total + amt);
    jLines.push({
      account: acc,
      debit: amt,
      credit: 0,
      memo: ln.description || "Expense",
    });
  }
  if (total <= 0) {
    throw new Error("Nothing to post: no positive line amounts.");
  }
  jLines.push({
    account: cash,
    debit: 0,
    credit: total,
    memo: `Expense ${report.expenseNumber} payout`,
  });

  const { entry } = await createJournalEntry(
    {
      organization: orgId,
      entryDate: new Date(),
      memo: `Expense report ${report.expenseNumber}`,
      sourceType: "expense_report",
      sourceId: report._id,
      createdBy: userId || null,
      companyCurrency: cfg.companyCurrency || "USD",
      lines: jLines,
    },
    { idempotencyKey: iKey, userId, auditAction: "expense_report.posted" }
  );

  report.status = "posted";
  report.journalEntry = entry._id;
  await report.save();
  return entry;
}

module.exports = {
  ...module.exports,
  createVendorBillFromPO,
  postVendorBill,
  recordVendorBillPayment,
  voidVendorBill,
  postExpenseReportToGl,
};

/**
 * CREDIT NOTES
 */

async function issueCreditNote(invoiceId, data, userId) {
  const inv = await AccountingInvoice.findById(invoiceId);
  if (!inv) throw new Error("Invoice not found");
  if (inv.status === "void") throw new Error("Cannot credit a void invoice");

  const orgId = inv.organization;
  const cfg = await getConfig(orgId);
  const revenueAcc = cfg.defaultRevenueAccount?._id || cfg.defaultRevenueAccount || (await AccountingAccount.findOne({ organization: orgId, code: "4000" }))?._id;
  const arAcc = cfg.defaultAccountsReceivableAccount?._id || cfg.defaultAccountsReceivableAccount;

  if (!arAcc || !revenueAcc) throw new Error("Revenue or AR accounts not configured.");

  const amount = round2(data.amount || inv.total);
  if (amount <= 0) throw new Error("Credit amount must be positive");
  if (amount > inv.total - inv.amountPaid + 0.01) {
    // Note: Business logic might differ, but usually CN doesn't exceed balance unless it creates credit.
    // For now, let's allow it as it might be a full return.
  }

  // Multi-tenant sequence for Credit Note Numbers
  const seq = await nextSequence("creditNote", orgId);
  const creditNoteNumber = `CN-${seq.toString().padStart(5, "0")}`;

  const cn = await CreditNote.create({
    organization: orgId,
    creditNoteNumber,
    customer: inv.customer,
    invoice: inv._id,
    status: "posted",
    issueDate: data.issueDate || new Date(),
    currency: inv.currency,
    subtotal: amount, // Simplified
    tax: 0,
    total: amount,
    reason: data.reason || "",
    notes: data.notes || "",
  });

  // Post Journal Entry: Dr Revenue, Cr AR (Reverse are)
  const journalLines = [
    { account: revenueAcc, debit: amount, credit: 0, memo: `Credit Note ${creditNoteNumber} reversal` },
    { account: arAcc, debit: 0, credit: amount, memo: `Offset against invoice ${inv.invoiceNumber}` },
  ];

  await createJournalEntry({
    organization: orgId,
    entryDate: cn.issueDate,
    memo: `Issuing Credit Note ${creditNoteNumber}`,
    sourceType: "credit_note",
    sourceId: cn._id,
    createdBy: userId,
    companyCurrency: cfg.companyCurrency,
    lines: journalLines,
  }, { userId, auditAction: "credit_note.issued" });

  // Update Invoice balance/status
  inv.amountPaid = round2(inv.amountPaid + amount);
  if (inv.amountPaid >= inv.total - 0.01) {
    inv.status = "paid";
  } else {
    inv.status = "partial";
  }
  await inv.save();

  return cn;
}


/**
 * GRNI ACCRUAL
 */

async function postGrniAccrual(poId, receives, userId) {
  const po = await PurchaseOrder.findById(poId).populate("lines.ingredient");
  if (!po) throw new Error("Purchase order not found for GRNI accrual.");
  
  const orgId = po.organization;
  const cfg = await getConfig(orgId);
  const grniAcc = cfg.defaultGrniAccount?._id || cfg.defaultGrniAccount;
  const invAcc =
    cfg.defaultInventoryAssetAccount?._id ||
    cfg.defaultInventoryAssetAccount ||
    (await AccountingAccount.findOne({ organization: orgId, code: "1200" }))?._id;

  if (!grniAcc || !invAcc) throw new Error("GRNI or Inventory accounts not configured.");

  let totalAccrual = 0;
  const journalLines = [];

  for (const r of receives) {
    const line = po.lines.id(r.lineId);
    if (!line) continue;
    
    const qty = Number(r.quantity);
    const uc = Number(r.unitCost) || Number(line.unitCost) || 0;
    const lineTotal = round2(qty * uc);
    
    if (lineTotal <= 0) continue;

    journalLines.push({
      account: invAcc,
      debit: lineTotal,
      credit: 0,
      memo: `GRNI Accrual: ${line.description || "Goods"} receipt`,
    });
    totalAccrual = round2(totalAccrual + lineTotal);
  }

  if (totalAccrual > 0) {
    journalLines.push({
      account: grniAcc,
      debit: 0,
      credit: totalAccrual,
      memo: `Accrual for PO ${po._id}`,
    });

    await createJournalEntry({
      organization: orgId,
      entryDate: new Date(),
      memo: `GRNI Accrual for PO receipt`,
      sourceType: "grni_accrual",
      sourceId: po._id,
      createdBy: userId,
      companyCurrency: cfg.companyCurrency,
      lines: journalLines,
    }, { userId, auditAction: "po.grni_accrual" });
  }

  return true;
}

async function matchBankStatementLine(lineId, journalLineId, organizationId) {
  const line = await BankStatementLine.findOne({ _id: lineId, organization: organizationId });
  if (!line) throw new Error("Bank statement line not found.");
  if (!mongoose.Types.ObjectId.isValid(String(journalLineId))) {
    throw new Error("Invalid journal line id.");
  }
  const journalEntry = await JournalEntry.findOne({
    organization: organizationId,
    "lines._id": journalLineId,
  })
    .select("_id lines")
    .lean();
  if (!journalEntry) throw new Error("Journal line not found for this organization.");
  const matchedLine = (journalEntry.lines || []).find(
    (row) => String(row._id) === String(journalLineId)
  );
  if (!matchedLine) throw new Error("Journal line not found.");
  const bankAmount = round2(Math.abs(Number(line.amount) || 0));
  const journalAmount = round2(
    Math.abs(Number(matchedLine.debit) || 0) || Math.abs(Number(matchedLine.credit) || 0)
  );
  if (bankAmount !== journalAmount) {
    throw new Error("Journal line amount does not match bank statement amount.");
  }

  line.matchedJournalLine = journalLineId;
  line.status = "matched";
  line.reconciledAt = new Date();
  await line.save();
  return line;
}

/**
 * Returns suggested journal entry lines for a bank statement line based on amount + date proximity.
 */
async function getMatchingSuggestionsForBankLine(lineId, organizationId) {
  const line = await BankStatementLine.findOne({ _id: lineId, organization: organizationId });
  if (!line) throw new Error("Line not found");

  const start = new Date(line.postedAt);
  start.setDate(start.getDate() - 3);
  const end = new Date(line.postedAt);
  end.setDate(end.getDate() + 3);

  const amt = Math.abs(line.amount);

  // Find journals with matching amount (debit or credit) within date window
  const matches = await JournalEntry.aggregate([
    {
      $match: {
        organization: organizationId,
        entryDate: { $gte: start, $lte: end },
      },
    },
    { $unwind: "$lines" },
    {
      $match: {
        $or: [
          { "lines.debit": amt },
          { "lines.credit": amt }
        ],
      },
    },
    { $limit: 10 }
  ]);

  return matches;
}

async function bankReconciliationReport(organizationId) {
  const cfg = await getConfig(organizationId);
  const bankAccount = cfg.defaultCardClearingAccount?._id || cfg.defaultCardClearingAccount;
  if (!bankAccount) throw new Error("Card clearing/Bank account not configured.");

  const lines = await BankStatementLine.find({ organization: organizationId }).lean();
  
  const totalStatement = round2(lines.reduce((s, l) => s + (Number(l.amount) || 0), 0));
  const totalMatched = round2(lines.filter(l => l.status !== "unmatched").reduce((s, l) => s + (Number(l.amount) || 0), 0));
  const totalUnmatched = round2(totalStatement - totalMatched);

  // GL Balance for this account
  const GL_match = {
    organization: organizationId,
    "lines.account": bankAccount,
  };
  const glResult = await JournalEntry.aggregate([
    { $match: GL_match },
    { $unwind: "$lines" },
    { $match: { "lines.account": bankAccount } },
    { $group: { _id: null, balance: { $sum: { $subtract: ["$lines.debit", "$lines.credit"] } } } }
  ]);
  const glBalance = round2(glResult[0]?.balance || 0);

  return {
    bankAccount,
    totalStatement,
    totalMatched,
    totalUnmatched,
    glBalance,
    difference: round2(totalMatched - glBalance),
  };
}

/**
 * Returns journal lines for a specific account with running balance.
 */
async function accountLedger(accountId, { start, end, organizationId }) {
  const match = { 
    organization: organizationId,
    "lines.account": new mongoose.Types.ObjectId(String(accountId))
  };
  if (start || end) {
    match.entryDate = {};
    if (start) match.entryDate.$gte = new Date(start);
    if (end) match.entryDate.$lte = new Date(end);
  }

  const entries = await JournalEntry.find(match)
    .populate("lines.account", "code name type")
    .sort({ entryDate: 1, entryNumber: 1 })
    .lean();

  const lines = [];
  let runningBalance = 0;

  for (const entry of entries) {
    for (const l of entry.lines) {
      if (String(l.account._id || l.account) === String(accountId)) {
        const dr = round2(l.debit || 0);
        const cr = round2(l.credit || 0);
        runningBalance = round2(runningBalance + dr - cr);
        lines.push({
          entryId: entry._id,
          entryNumber: entry.entryNumber,
          entryDate: entry.entryDate,
          memo: l.memo || entry.memo,
          debit: dr,
          credit: cr,
          balance: runningBalance,
        });
      }
    }
  }

  return {
    accountId,
    lines,
    finalBalance: runningBalance,
  };
}

async function listRecurringJournalTemplates(organizationId) {
  return RecurringJournalTemplate.find({ organization: organizationId }).populate("templateLines.account", "code name");
}

async function createRecurringJournalTemplate(doc, organizationId) {
  const t = new RecurringJournalTemplate({
    ...doc,
    organization: organizationId,
  });
  // Calculate first run
  const now = new Date();
  if (!t.nextRunAt || t.nextRunAt < now) {
    t.nextRunAt = new Date();
    if (t.frequency === "daily") t.nextRunAt.setDate(t.nextRunAt.getDate() + 1);
    else if (t.frequency === "weekly") t.nextRunAt.setDate(t.nextRunAt.getDate() + 7);
    else if (t.frequency === "monthly") t.nextRunAt.setMonth(t.nextRunAt.getMonth() + 1);
  }
  return t.save();
}

async function updateRecurringJournalTemplate(id, doc, organizationId) {
  return RecurringJournalTemplate.findOneAndUpdate(
    { _id: id, organization: organizationId },
    { $set: doc },
    { new: true }
  );
}

async function deleteRecurringJournalTemplate(id, organizationId) {
  return RecurringJournalTemplate.deleteOne({ _id: id, organization: organizationId });
}

async function runRecurringJournalTemplate({ templateId, organizationId, userId }) {
  if (!mongoose.Types.ObjectId.isValid(templateId)) {
    const err = new Error("Invalid template id");
    err.status = 400;
    throw err;
  }
  if (!organizationId) throw new Error("organizationId is required");

  const template = await RecurringJournalTemplate.findOne({
    _id: templateId,
    organization: organizationId,
  });
  if (!template) {
    const err = new Error("Recurring template not found");
    err.status = 404;
    throw err;
  }
  if (!template.templateLines || template.templateLines.length === 0) {
    const err = new Error("Template has no lines to post");
    err.status = 400;
    throw err;
  }

  const now = new Date();
  const iKey = `recurring-journal:${template._id}:${now.getTime()}`;
  const lines = template.templateLines.map((l) => ({
    account: l.account,
    debit: round2(l.debit || 0),
    credit: round2(l.credit || 0),
    memo: l.memo || template.memo,
  }));

  const { entry, reused } = await createJournalEntry(
    {
      organization: organizationId,
      entryDate: now,
      memo: template.memo,
      sourceType: "recurring_journal",
      sourceId: template._id,
      createdBy: userId || null,
      lines,
      metadata: { recurringTemplateId: String(template._id), manualRun: true },
    },
    { idempotencyKey: iKey, userId, auditAction: "journal.recurring_manual_run" }
  );

  if (!reused) {
    template.lastRunAt = now;
    const next = new Date(now);
    if (template.frequency === "daily") next.setDate(next.getDate() + 1);
    else if (template.frequency === "weekly") next.setDate(next.getDate() + 7);
    else if (template.frequency === "monthly") next.setMonth(next.getMonth() + 1);
    template.nextRunAt = next;
    await template.save();
  }

  return { template, entry, reused };
}

async function runRecurringInvoiceTemplate({ templateId, organizationId, userId }) {
  if (!mongoose.Types.ObjectId.isValid(templateId)) {
    const err = new Error("Invalid template id");
    err.status = 400;
    throw err;
  }
  if (!organizationId) throw new Error("organizationId is required");
  const template = await RecurringInvoiceTemplate.findOne({
    _id: templateId,
    organization: organizationId,
  });
  if (!template) {
    const err = new Error("Recurring invoice template not found");
    err.status = 404;
    throw err;
  }
  if (!template.isActive) {
    const err = new Error("Template is inactive");
    err.status = 400;
    throw err;
  }
  const now = new Date();
  if (template.startAt && template.startAt > now) {
    const err = new Error("Template start date is in the future.");
    err.status = 400;
    throw err;
  }
  if (template.endAt && template.endAt < now) {
    const err = new Error("Template has reached its end date.");
    err.status = 400;
    throw err;
  }
  const invoice = await issueInvoiceFromTemplate(template._id, userId, { trigger: "manual" });
  if (!invoice) {
    const err = new Error("Invoice could not be issued");
    err.status = 500;
    throw err;
  }
  return { template, invoice };
}

function computeNextIssueDate(baseDate, frequency) {
  const next = new Date(baseDate);
  if (frequency === "daily") next.setDate(next.getDate() + 1);
  else if (frequency === "weekly") next.setDate(next.getDate() + 7);
  else if (frequency === "monthly") next.setMonth(next.getMonth() + 1);
  return next;
}

async function appendRecurringInvoiceRunLog(templateId, payload) {
  const logEntry = {
    runAt: payload.runAt || new Date(),
    status: payload.status || "success",
    trigger: payload.trigger || "worker",
    invoiceId: payload.invoiceId || null,
    invoiceNumber: payload.invoiceNumber || "",
    message: payload.message || "",
  };
  await RecurringInvoiceTemplate.findByIdAndUpdate(templateId, {
    $push: {
      runLogs: {
        $each: [logEntry],
        $slice: -30,
      },
    },
  });
  if (payload.organizationId && (payload.status === "failed" || payload.status === "skipped")) {
    await createBackofficeNotificationFromEvent(
      payload.status === "failed"
        ? NOTIFICATION_EVENTS.RECURRING_INVOICE_FAILED
        : NOTIFICATION_EVENTS.RECURRING_INVOICE_SKIPPED,
      {
        organizationId: payload.organizationId,
        templateId: String(templateId),
        body: payload.message || "Recurring invoice execution did not complete.",
      },
    );
  }
}

async function previewRecurringInvoiceSchedule({
  organizationId,
  customer,
  frequency,
  startAt,
  endAt,
  nextIssueAt,
  dueDays,
  timezone,
  currency,
  templateLines,
  count,
}) {
  if (!organizationId) throw new Error("organizationId is required");
  if (!mongoose.Types.ObjectId.isValid(customer)) {
    const err = new Error("Valid billing customer is required");
    err.status = 400;
    throw err;
  }
  const customerDoc = await Customer.findOne({ _id: customer, organization: organizationId })
    .select("email vatNumber isBillingCustomer")
    .lean();
  const hasBillingIdentity = Boolean(
    (typeof customerDoc?.email === "string" && customerDoc.email.trim().length > 0) ||
      (typeof customerDoc?.vatNumber === "string" && customerDoc.vatNumber.trim().length > 0),
  );
  const billableFlagOk = customerDoc?.isBillingCustomer !== false;
  if (!customerDoc || !billableFlagOk || !hasBillingIdentity) {
    const err = new Error("Billing customer must be marked billable and include email or VAT number.");
    err.status = 400;
    throw err;
  }

  const normalizedLines = Array.isArray(templateLines)
    ? templateLines
        .map((line) => ({
          description: String(line?.description || "").trim(),
          quantity: Number(line?.quantity),
          unitPrice: Number(line?.unitPrice),
        }))
        .filter((line) => line.description.length > 0)
    : [];
  if (normalizedLines.length === 0) {
    const err = new Error("Add at least one line to preview.");
    err.status = 400;
    throw err;
  }
  const subtotal = round2(
    normalizedLines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0),
  );
  const tax = 0;
  const total = round2(subtotal + tax);
  const dueDaysValue = Number.isFinite(Number(dueDays)) ? Math.max(1, Math.min(365, Number(dueDays))) : 14;
  const safeFrequency = ["daily", "weekly", "monthly"].includes(String(frequency))
    ? String(frequency)
    : "monthly";
  const maxCount = Math.max(1, Math.min(12, Number(count) || 3));

  const startDate = startAt ? new Date(startAt) : null;
  const endDate = endAt ? new Date(endAt) : null;
  const seedDate = nextIssueAt ? new Date(nextIssueAt) : new Date();
  const firstCandidate = Number.isNaN(seedDate.getTime()) ? new Date() : seedDate;
  let issueAt = firstCandidate;
  if (startDate && !Number.isNaN(startDate.getTime()) && issueAt < startDate) {
    issueAt = startDate;
  }

  const runs = [];
  let guard = 0;
  while (runs.length < maxCount && guard < 32) {
    guard += 1;
    if (endDate && !Number.isNaN(endDate.getTime()) && issueAt > endDate) break;
    runs.push({
      issueDate: issueAt.toISOString(),
      dueDate: new Date(issueAt.getTime() + dueDaysValue * 24 * 60 * 60 * 1000).toISOString(),
      subtotal,
      tax,
      total,
      currency: (currency || "USD").toUpperCase(),
      timezone: timezone || "UTC",
    });
    issueAt = computeNextIssueDate(issueAt, safeFrequency);
  }

  return {
    frequency: safeFrequency,
    dueDays: dueDaysValue,
    timezone: timezone || "UTC",
    count: runs.length,
    runs,
  };
}

async function budgetVsActual(organizationId, { fiscalYear, periodMonth }) {
  const budgets = await Budget.find({
    organization: organizationId,
    fiscalYear,
    periodMonth
  }).populate("accountId", "code name").lean();

  const results = [];
  for (const b of budgets) {
    const start = new Date(Date.UTC(fiscalYear, periodMonth - 1, 1));
    const end = new Date(Date.UTC(fiscalYear, periodMonth, 0, 23, 59, 59, 999));

    const moves = await JournalEntry.aggregate([
      { $match: { organization: organizationId, entryDate: { $gte: start, $lte: end } } },
      { $unwind: "$lines" },
      { $match: { "lines.account": b.accountId._id } },
      {
        $group: {
          _id: "$lines.account",
          actual: { $sum: { $subtract: ["$lines.debit", "$lines.credit"] } }
        }
      }
    ]);

    const actual = Math.abs(moves[0]?.actual || 0);
    const variance = b.budgetedAmount - actual;

    results.push({
      account: b.accountId,
      budgeted: b.budgetedAmount,
      actual,
      variance,
      performance: b.budgetedAmount > 0 ? (actual / b.budgetedAmount) * 100 : 0
    });
  }

  return results;
}

async function issueInvoiceFromTemplate(templateId, userId, options = {}) {
  const trigger = options.trigger === "manual" ? "manual" : "worker";
  const t = await RecurringInvoiceTemplate.findById(templateId);
  if (!t || !t.isActive) return null;
  const now = new Date();

  if (t.startAt && t.startAt > now) {
    await appendRecurringInvoiceRunLog(t._id, {
      status: "skipped",
      trigger,
      message: "Skipped because template start date is in the future.",
      organizationId: String(t.organization),
    });
    return null;
  }
  if (t.endAt && t.endAt < now) {
    t.isActive = false;
    t.status = "completed";
    await t.save();
    await appendRecurringInvoiceRunLog(t._id, {
      status: "skipped",
      trigger,
      message: "Skipped because template end date has passed.",
      organizationId: String(t.organization),
    });
    return null;
  }

  const customer = await Customer.findOne({ _id: t.customer, organization: t.organization })
    .select("email vatNumber isBillingCustomer")
    .lean();
  const hasBillingIdentity = Boolean(
    (typeof customer?.email === "string" && customer.email.trim().length > 0) ||
      (typeof customer?.vatNumber === "string" && customer.vatNumber.trim().length > 0),
  );
  const billableFlagOk = customer?.isBillingCustomer !== false;
  if (!hasBillingIdentity || !billableFlagOk) {
    await appendRecurringInvoiceRunLog(t._id, {
      status: "failed",
      trigger,
      message: "Billing customer must be marked billable and include email or VAT number.",
      organizationId: String(t.organization),
    });
    return null;
  }

  try {
    const invoiceNumber = await nextSequence("accountingInvoice", t.organization);
    const dueDays = Number.isFinite(t.dueDays) ? Math.max(1, Math.min(365, Number(t.dueDays))) : 14;
    const AccountingInvoice = require("../models/accountingInvoiceModel");
    const inv = new AccountingInvoice({
      organization: t.organization,
      invoiceNumber: String(invoiceNumber),
      customer: t.customer,
      status: "posted",
      issueDate: now,
      dueDate: new Date(now.getTime() + dueDays * 24 * 60 * 60 * 1000),
      currency: t.currency || "USD",
      notes: t.notes,
      lines: t.templateLines.map((line) => ({
        itemDescription: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        lineTotal: line.quantity * line.unitPrice,
      })),
    });

    inv.subtotal = inv.lines.reduce((sum, line) => sum + line.lineTotal, 0);
    inv.tax = 0;
    inv.total = inv.subtotal + inv.tax;

    await inv.save();

    const getConfig = async (orgId) => {
      const AccountingConfig = require("../models/accountingConfigModel");
      return AccountingConfig.findOne({ organization: orgId }).lean();
    };

    const cfg = await getConfig(t.organization);
    const arAccount = cfg?.defaultAccountsReceivableAccount?._id || cfg?.defaultAccountsReceivableAccount;
    const salesAccount = cfg?.defaultSalesAccount?._id || cfg?.defaultSalesAccount;

    if (arAccount && salesAccount) {
      await module.exports.createJournalEntry({
        organization: t.organization,
        entryDate: now,
        memo: `Recurring Invoice ${inv.invoiceNumber}`,
        sourceType: "sales",
        sourceId: inv._id,
        createdBy: userId,
        lines: [
          { account: arAccount, debit: inv.total, credit: 0 },
          { account: salesAccount, debit: 0, credit: inv.total }
        ]
      }, { auditAction: "invoice.recurring_post" });
    }

    const next = computeNextIssueDate(now, t.frequency);
    t.lastIssuedAt = now;
    t.nextIssueAt = next;
    if (t.endAt && next > t.endAt) {
      t.status = "completed";
      t.isActive = false;
    }
    await t.save();
    await appendRecurringInvoiceRunLog(t._id, {
      status: "success",
      trigger,
      invoiceId: inv._id,
      invoiceNumber: inv.invoiceNumber,
      message: "Recurring invoice issued successfully.",
      organizationId: String(t.organization),
    });
    return inv;
  } catch (error) {
    await appendRecurringInvoiceRunLog(t._id, {
      status: "failed",
      trigger,
      message: error?.message || "Recurring invoice issuance failed.",
      organizationId: String(t.organization),
    });
    throw error;
  }
}

module.exports = {
  ...module.exports,
  postVendorReturnGl,
  issueCreditNote,
  postGrniAccrual,
  cashFlowReport,
  matchBankStatementLine,
  getMatchingSuggestionsForBankLine,
  bankReconciliationReport,
  accountLedger,
  listRecurringJournalTemplates,
  createRecurringJournalTemplate,
  updateRecurringJournalTemplate,
  deleteRecurringJournalTemplate,
  runRecurringJournalTemplate,
  runRecurringInvoiceTemplate,
  previewRecurringInvoiceSchedule,
  budgetVsActual,
  issueInvoiceFromTemplate,
};
