const createHttpError = require("http-errors");
const mongoose = require("mongoose");
const AccountingAccount = require("../models/accountingAccountModel");
const JournalEntry = require("../models/journalEntryModel");
const AccountingConfig = require("../models/accountingConfigModel");
const AccountingSession = require("../models/accountingSessionModel");
const JournalAuditLog = require("../models/journalAuditLogModel");
const BankStatementLine = require("../models/bankStatementLineModel");
const FxRate = require("../models/fxRateModel");
const Budget = require("../models/budgetModel");
const AccountingPeriod = require("../models/accountingPeriodModel");
const RecurringInvoiceTemplate = require("../models/recurringInvoiceTemplateModel");
const RecurringJournalTemplate = require("../models/recurringJournalTemplateModel");
const Customer = require("../models/customerModel");
const PosAuditLog = require("../models/posAuditLogModel");
const { parsePaginationQuery } = require("../utils/listPagination");
const accountingService = require("../services/accountingService");
const accountingPdfService = require("../services/accountingPdfService");
const bankCsvImportService = require("../services/bankCsvImportService");
const Organization = require("../models/organizationModel");
const Order = require("../models/orderModel");
const {
  enqueueBigcapitalVoidIfEnabled,
  enqueueBigcapitalPartialRefundIfEnabled,
} = require("../services/bigcapitalSyncEnqueue");
const { assertTenantOrganization } = require("../utils/tenantOrg");
const {
  NOTIFICATION_EVENTS,
  createBackofficeNotificationFromEvent,
} = require("../services/backofficeNotificationEvents");
const { runInventoryAlertsOnce } = require("../services/inventoryAlertService");

const listAccounts = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { type, active } = req.query;
    const q = { organization: orgId };
    if (type) q.type = String(type);
    if (active === "true") q.isActive = true;
    if (active === "false") q.isActive = false;
    const accounts = await AccountingAccount.find(q).sort({
      sortOrder: 1,
      code: 1,
    });
    res.status(200).json({ success: true, data: accounts });
  } catch (e) {
    next(e);
  }
};

const createAccount = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { code, name, type, isActive, sortOrder } = req.body;
    if (!code || !String(code).trim()) {
      return next(createHttpError(400, "code is required"));
    }
    if (!name || !String(name).trim()) {
      return next(createHttpError(400, "name is required"));
    }
    if (!type) {
      return next(createHttpError(400, "type is required"));
    }
    const acc = await AccountingAccount.create({
      organization: orgId,
      code: String(code).trim(),
      name: String(name).trim(),
      type,
      isActive: isActive !== false,
      sortOrder: Number(sortOrder) || 0,
    });
    res.status(201).json({ success: true, data: acc });
  } catch (e) {
    if (e.code === 11000) {
      return next(createHttpError(400, "Account code already exists."));
    }
    next(e);
  }
};

const updateAccount = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid id"));
    }
    const acc = await AccountingAccount.findOne({
      _id: id,
      organization: orgId,
    });
    if (!acc) return next(createHttpError(404, "Not found"));
    const { name, type, isActive, sortOrder } = req.body;
    if (name !== undefined) acc.name = String(name).trim();
    if (type !== undefined) acc.type = type;
    if (isActive !== undefined) acc.isActive = !!isActive;
    if (sortOrder !== undefined) acc.sortOrder = Number(sortOrder) || 0;
    await acc.save();
    res.status(200).json({ success: true, data: acc });
  } catch (e) {
    next(e);
  }
};

const getConfig = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const cfg = await accountingService.getConfig(orgId);
    res.status(200).json({ success: true, data: cfg });
  } catch (e) {
    next(e);
  }
};

const updateConfig = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    await accountingService.ensureDefaultAccountsAndConfig(orgId);
    let cfg = await AccountingConfig.findOne({ organization: orgId });
    const b = req.body;
    if (b.autoPostOnPaid !== undefined) cfg.autoPostOnPaid = !!b.autoPostOnPaid;
    const oid = (x) =>
      x && mongoose.Types.ObjectId.isValid(x) ? x : undefined;
    if (b.defaultRevenueAccount !== undefined) {
      cfg.defaultRevenueAccount = oid(b.defaultRevenueAccount) || null;
    }
    if (b.defaultTaxPayableAccount !== undefined) {
      cfg.defaultTaxPayableAccount = oid(b.defaultTaxPayableAccount) || null;
    }
    if (b.defaultCashAccount !== undefined) {
      cfg.defaultCashAccount = oid(b.defaultCashAccount) || null;
    }
    if (b.defaultCardClearingAccount !== undefined) {
      cfg.defaultCardClearingAccount = oid(b.defaultCardClearingAccount) || null;
    }
    if (b.defaultDiscountAccount !== undefined) {
      cfg.defaultDiscountAccount = oid(b.defaultDiscountAccount) || null;
    }
    if (b.defaultPurchasesExpenseAccount !== undefined) {
      cfg.defaultPurchasesExpenseAccount =
        oid(b.defaultPurchasesExpenseAccount) || null;
    }
    if (b.defaultCustomerDepositAccount !== undefined) {
      cfg.defaultCustomerDepositAccount =
        oid(b.defaultCustomerDepositAccount) || null;
    }
    if (Array.isArray(b.paymentMethodAccounts)) {
      cfg.paymentMethodAccounts = b.paymentMethodAccounts
        .filter((m) => m.methodKey && m.account)
        .map((m) => ({
          methodKey: String(m.methodKey).toLowerCase().trim(),
          account: m.account,
        }));
    }
    if (b.companyCurrency !== undefined) {
      cfg.companyCurrency = String(b.companyCurrency).toUpperCase().trim() || "USD";
    }
    if (b.autoPostCogsOnPaid !== undefined) {
      cfg.autoPostCogsOnPaid = !!b.autoPostCogsOnPaid;
    }
    if (b.defaultAccountsReceivableAccount !== undefined) {
      cfg.defaultAccountsReceivableAccount =
        oid(b.defaultAccountsReceivableAccount) || null;
    }
    if (b.defaultTipsPayableAccount !== undefined) {
      cfg.defaultTipsPayableAccount =
        oid(b.defaultTipsPayableAccount) || null;
    }
    if (b.defaultServiceChargePayableAccount !== undefined) {
      cfg.defaultServiceChargePayableAccount =
        oid(b.defaultServiceChargePayableAccount) || null;
    }
    if (b.serviceChargeEnabled !== undefined) {
      cfg.serviceChargeEnabled = !!b.serviceChargeEnabled;
    }
    if (b.serviceChargeRate !== undefined) {
      const rate = Number(b.serviceChargeRate);
      if (Number.isFinite(rate) && rate >= 0 && rate <= 100) {
        cfg.serviceChargeRate = rate;
      }
    }
    if (cfg.serviceChargeEnabled && !cfg.defaultServiceChargePayableAccount) {
      return next(
        createHttpError(400, "defaultServiceChargePayableAccount is required when service charge is enabled.")
      );
    }
    if (Array.isArray(b.taxRates)) {
      cfg.taxRates = b.taxRates
        .filter((t) => t.code && t.account)
        .map((t) => ({
          code: String(t.code).trim(),
          name: t.name ? String(t.name).trim() : "",
          rate: Number(t.rate) || 0,
          kind:
            String(t.kind || "sales").toLowerCase() === "withholding"
              ? "withholding"
              : "sales",
          account: t.account,
        }));
    }
    if (b.branchVatRatePercent !== undefined) {
      const locationId = req.locationScopeId;
      if (!locationId) {
        return next(
          createHttpError(
            400,
            "branchVatRatePercent requires a location scope (X-Location-Id)."
          )
        );
      }
      const nextRate = Number(b.branchVatRatePercent);
      if (!Number.isFinite(nextRate) || nextRate < 0 || nextRate > 100) {
        return next(
          createHttpError(400, "branchVatRatePercent must be between 0 and 100.")
        );
      }
      const rows = Array.isArray(cfg.branchVatRates) ? cfg.branchVatRates : [];
      const idx = rows.findIndex(
        (row) => String(row.location) === String(locationId)
      );
      if (idx >= 0) {
        rows[idx].ratePercent = nextRate;
      } else {
        rows.push({
          location: locationId,
          ratePercent: nextRate,
        });
      }
      cfg.branchVatRates = rows;
    }
    if (b.defaultCostMethod !== undefined) {
      const m = String(b.defaultCostMethod).toLowerCase();
      if (
        m === "fifo" ||
        m === "fefo" ||
        m === "lifo" ||
        m === "weighted_average" ||
        m === "standard"
      ) {
        cfg.defaultCostMethod = m;
      }
    }
    if (b.retainedEarningsAccount !== undefined) {
      cfg.retainedEarningsAccount =
        oid(b.retainedEarningsAccount) || null;
    }
    if (b.stockDeductTrigger !== undefined) {
      const t = String(b.stockDeductTrigger).toLowerCase().trim();
      if (t === "kitchen_send" || t === "payment" || t === "both") {
        cfg.stockDeductTrigger = "payment";
      }
    }
    if (b.kitchenFlowMode !== undefined) {
      const mode = String(b.kitchenFlowMode).toLowerCase().trim();
      if (mode === "station_tickets" || mode === "kitchen_display") {
        cfg.kitchenFlowMode = mode;
      }
    }
    if (b.discountReasonRequired !== undefined) {
      cfg.discountReasonRequired = !!b.discountReasonRequired;
    }
    if (b.strictOversell !== undefined) {
      cfg.strictOversell = !!b.strictOversell;
    }
    if (b.reserveStockOnPending !== undefined) {
      cfg.reserveStockOnPending = !!b.reserveStockOnPending;
    }
    if (b.roundOffAccount !== undefined) {
      cfg.roundOffAccount = oid(b.roundOffAccount) || null;
    }
    if (b.realizedFxGainAccount !== undefined) {
      cfg.realizedFxGainAccount = oid(b.realizedFxGainAccount) || null;
    }
    if (b.realizedFxLossAccount !== undefined) {
      cfg.realizedFxLossAccount = oid(b.realizedFxLossAccount) || null;
    }
    if (b.defaultGiftCardLiabilityAccount !== undefined) {
      cfg.defaultGiftCardLiabilityAccount =
        oid(b.defaultGiftCardLiabilityAccount) || null;
    }
    if (b.defaultPurchasePriceVarianceAccount !== undefined) {
      cfg.defaultPurchasePriceVarianceAccount =
        oid(b.defaultPurchasePriceVarianceAccount) || null;
    }
    if (b.defaultInventoryAssetAccount !== undefined) {
      cfg.defaultInventoryAssetAccount =
        oid(b.defaultInventoryAssetAccount) || null;
    }
    if (b.defaultStockTakeVarianceAccount !== undefined) {
      cfg.defaultStockTakeVarianceAccount =
        oid(b.defaultStockTakeVarianceAccount) || null;
    }
    if (b.inventoryAlertWebhookUrl !== undefined) {
      cfg.inventoryAlertWebhookUrl = String(b.inventoryAlertWebhookUrl || "")
        .trim()
        .slice(0, 2048);
    }
    if (b.automationWebhookEnabled !== undefined) {
      cfg.automationWebhookEnabled = !!b.automationWebhookEnabled;
    }
    if (b.automationWebhookUrl !== undefined) {
      cfg.automationWebhookUrl = String(b.automationWebhookUrl || "")
        .trim()
        .slice(0, 2048);
    }
    if (b.inventoryAlertsEnabled !== undefined) {
      cfg.inventoryAlertsEnabled = !!b.inventoryAlertsEnabled;
    }
    if (b.inventoryExpiryAlertDays !== undefined) {
      const n = Number(b.inventoryExpiryAlertDays);
      if (Number.isFinite(n) && n >= 0 && n <= 365) {
        cfg.inventoryExpiryAlertDays = Math.floor(n);
      }
    }
    if (b.requireApprovalsForVendorPosting !== undefined) {
      cfg.requireApprovalsForVendorPosting = !!b.requireApprovalsForVendorPosting;
    }
    if (b.requireApprovalsForExpensePosting !== undefined) {
      cfg.requireApprovalsForExpensePosting = !!b.requireApprovalsForExpensePosting;
    }
    await cfg.save();
    const populated = await accountingService.getConfig(orgId);
    res.status(200).json({ success: true, data: populated });
  } catch (e) {
    next(e);
  }
};

function isValidAutomationWebhookUrl(url) {
  const raw = String(url || "").trim();
  return /^https?:\/\//i.test(raw);
}

async function sendAutomationWebhook(cfg, payload) {
  if (!cfg?.automationWebhookEnabled) {
    return { sent: false, reason: "disabled" };
  }
  const url = String(cfg.automationWebhookUrl || "").trim();
  if (!isValidAutomationWebhookUrl(url)) {
    return { sent: false, reason: "invalid_url" };
  }
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw createHttpError(
      502,
      `Automation webhook failed (${response.status}): ${details.slice(0, 200)}`
    );
  }
  return { sent: true, reason: "ok" };
}

const runAutomationHooks = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const cfg = await AccountingConfig.findOne({ organization: orgId }).select(
      "automationWebhookEnabled automationWebhookUrl"
    );
    const now = new Date();
    const [dueJournalTemplates, dueInvoiceTemplates] = await Promise.all([
      RecurringJournalTemplate.find({
        organization: orgId,
        isActive: true,
        nextRunAt: { $lte: now },
      })
        .select("_id")
        .lean(),
      RecurringInvoiceTemplate.find({
        organization: orgId,
        isActive: true,
        nextIssueAt: { $lte: now },
        $and: [
          { $or: [{ startAt: null }, { startAt: { $lte: now } }] },
          { $or: [{ endAt: null }, { endAt: { $gte: now } }] },
        ],
      })
        .select("_id")
        .lean(),
    ]);

    let recurringJournalsPosted = 0;
    for (const template of dueJournalTemplates) {
      const out = await accountingService.runRecurringJournalTemplate({
        templateId: template._id,
        organizationId: orgId,
        userId: req.user?._id || null,
      });
      if (out?.entry?._id) recurringJournalsPosted += 1;
    }

    let recurringInvoicesIssued = 0;
    for (const template of dueInvoiceTemplates) {
      const invoice = await accountingService.issueInvoiceFromTemplate(
        template._id,
        req.user?._id || null,
        { trigger: "manual" }
      );
      if (invoice?._id) recurringInvoicesIssued += 1;
    }

    const inventoryAlertSummary = await runInventoryAlertsOnce();
    const payload = {
      type: "automation_run",
      at: new Date().toISOString(),
      organizationId: String(orgId),
      byUserId: req.user?._id ? String(req.user._id) : null,
      result: {
        recurringJournalsPosted,
        recurringInvoicesIssued,
        inventoryAlertSummary,
      },
    };
    const webhook = await sendAutomationWebhook(cfg, payload);
    return res.status(200).json({
      success: true,
      data: {
        ...payload.result,
        automationWebhook: webhook,
      },
    });
  } catch (error) {
    next(error);
  }
};

const testAutomationWebhook = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const cfg = await AccountingConfig.findOne({ organization: orgId }).select(
      "automationWebhookEnabled automationWebhookUrl"
    );
    const payload = {
      type: "automation_webhook_test",
      at: new Date().toISOString(),
      organizationId: String(orgId),
      byUserId: req.user?._id ? String(req.user._id) : null,
    };
    const webhook = await sendAutomationWebhook(cfg, payload);
    return res.status(200).json({ success: true, data: webhook });
  } catch (error) {
    next(error);
  }
};

function escapeMongoRegexLiteral(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const listJournalEntries = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const pag = parsePaginationQuery(req.query);
    const filter = { organization: orgId };
    if (req.query.sourceType) filter.sourceType = req.query.sourceType;
    if (req.query.orderId && mongoose.Types.ObjectId.isValid(req.query.orderId)) {
      filter.order = req.query.orderId;
    }
    const memoQ = typeof req.query.memo === "string" ? req.query.memo.trim() : "";
    if (memoQ) {
      filter.memo = { $regex: escapeMongoRegexLiteral(memoQ), $options: "i" };
    }
    const { start, end } = req.query;
    if (start || end) {
      filter.entryDate = {};
      if (start) filter.entryDate.$gte = new Date(start);
      if (end) filter.entryDate.$lte = new Date(end);
    }
    const base = JournalEntry.find(filter)
      .populate("lines.account", "code name type")
      .populate({
        path: "order",
        select: "orderStatus bills paymentMethod table manualDiscountAmount loyaltyDiscountAmount paidAt",
        populate: { path: "table", select: "tableNo" },
      })
      .sort({ entryDate: -1, entryNumber: -1 });

    if (pag.active) {
      const [data, total] = await Promise.all([
        base.clone().skip(pag.skip).limit(pag.limit),
        JournalEntry.countDocuments(filter),
      ]);
      return res.status(200).json({
        success: true,
        data,
        page: pag.page,
        limit: pag.limit,
        total,
      });
    }
    const data = await base;
    res.status(200).json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

const getJournalEntry = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid id"));
    }
    const doc = await JournalEntry.findOne({
      _id: id,
      organization: orgId,
    })
      .populate("lines.account", "code name type")
      .populate({
        path: "order",
        populate: { path: "table", select: "tableNo section" },
      });
    if (!doc) return next(createHttpError(404, "Not found"));
    res.status(200).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};

const postManualJournal = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { memo, lines, entryDate } = req.body;
    if (!Array.isArray(lines) || lines.length < 2) {
      return next(createHttpError(400, "At least two lines required."));
    }
    const normalized = lines.map((l) => {
      const row = {
        account: l.account,
        debit: accountingService.round2(l.debit || 0),
        credit: accountingService.round2(l.credit || 0),
        memo: l.memo || "",
      };
      if (l.analytics != null && typeof l.analytics === "object") {
        const ax = {};
        if (l.analytics.costCenter != null && String(l.analytics.costCenter).trim()) {
          ax.costCenter = String(l.analytics.costCenter).trim();
        }
        if (l.analytics.locationId != null && String(l.analytics.locationId).trim()) {
          ax.locationId = String(l.analytics.locationId).trim();
        }
        if (l.analytics.branchId != null && String(l.analytics.branchId).trim()) {
          ax.branchId = String(l.analytics.branchId).trim();
        }
        if (Object.keys(ax).length) row.analytics = ax;
      }
      return row;
    });
    const cfg = await accountingService.getConfig(orgId);
    const idem = req.get("Idempotency-Key") || req.body.idempotencyKey;
    const { entry } = await accountingService.createJournalEntry(
      {
        organization: orgId,
        entryDate: entryDate ? new Date(entryDate) : new Date(),
        memo: memo || "Manual entry",
        sourceType: "manual",
        sourceId: null,
        createdBy: req.user?._id || null,
        companyCurrency: cfg.companyCurrency || "USD",
        lines: normalized,
      },
      {
        idempotencyKey: idem || undefined,
        userId: req.user?._id,
        auditAction: "journal.manual",
      }
    );
    const populated = await JournalEntry.findById(entry._id).populate(
      "lines.account",
      "code name type"
    );
    res.status(201).json({ success: true, data: populated });
  } catch (e) {
    next(e);
  }
};

const trialBalance = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { start, end, locationId, costCenter } = req.query;
    const tb = await accountingService.trialBalance({
      start,
      end,
      organizationId: orgId,
      locationId,
      costCenter,
    });
    res.status(200).json({ success: true, data: tb });
  } catch (e) {
    next(e);
  }
};

const repostOrder = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { orderId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return next(createHttpError(400, "Invalid order id"));
    }
    const existing = await JournalEntry.findOne({
      organization: orgId,
      sourceType: "order_sale",
      sourceId: orderId,
    });
    if (existing) {
      return res.status(200).json({
        success: true,
        message: "Already posted.",
        data: existing,
      });
    }
    const doc = await accountingService.postOrderSaleLedger(
      orderId,
      req.user?._id
    );
    if (!doc) {
      return res.status(400).json({
        success: false,
        message: "Nothing posted (zero total or auto-post off).",
      });
    }
    const populated = await JournalEntry.findById(doc._id).populate(
      "lines.account",
      "code name type"
    );
    res.status(201).json({ success: true, data: populated });
  } catch (e) {
    next(e);
  }
};

const reverseOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return next(createHttpError(400, "Invalid order id"));
    }
    const saleRev = await accountingService.reverseOrderSaleLedger(
      orderId,
      req.user?._id
    );
    let cogsRev = null;
    try {
      cogsRev = await accountingService.reverseOrderCogsLedger(
        orderId,
        req.user?._id
      );
    } catch {
      /* no COGS posted */
    }
    let saleReversal = null;
    if (saleRev) {
      saleReversal = await JournalEntry.findById(saleRev._id).populate(
        "lines.account",
        "code name type"
      );
    }
    const order = await Order.findById(orderId);
    if (order) {
      enqueueBigcapitalVoidIfEnabled(order, {
        originatedBy: "accounting.reverse_order",
      }).catch((err) => {
        console.error("[BigcapitalVoid] reverse-order enqueue:", err.message);
      });
    }

    res.status(201).json({
      success: true,
      data: {
        saleReversal,
        cogsReversalId: cogsRev?._id || null,
        nativeGlSkipped: !saleRev,
      },
    });
  } catch (e) {
    next(e);
  }
};

const postRefund = async (req, res, next) => {
  try {
    if (String(req.user?.role || "").toLowerCase() !== "admin") {
      return res
        .status(403)
        .json({ success: false, error: "Refunds require admin role" });
    }
    const orgId = assertTenantOrganization(req);
    const { orderId } = req.params;
    const { amount, refundToAccountId, idempotencyKey } = req.body;
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return next(createHttpError(400, "Invalid order id"));
    }
    if (amount === undefined || amount === null) {
      return next(createHttpError(400, "amount is required"));
    }
    const idem = req.get("Idempotency-Key") || idempotencyKey;
    const doc = await accountingService.postOrderRefund({
      orderId,
      amount: Number(amount),
      userId: req.user?._id,
      idempotencyKey: idem,
      refundToAccountId,
    });
    const nativeGlSkipped = !doc;
    const populated = doc
      ? await JournalEntry.findById(doc._id).populate(
          "lines.account",
          "code name type"
        )
      : null;
    const refundAmount = Number(amount);
    const order = await Order.findById(orderId);
    if (order && Number.isFinite(refundAmount)) {
      const orderTotal = Number(order.total || 0);
      if (refundAmount >= orderTotal - 0.01) {
        enqueueBigcapitalVoidIfEnabled(order, {
          originatedBy: "accounting.full_refund",
        }).catch((err) => {
          console.error("[BigcapitalVoid] full-refund enqueue:", err.message);
        });
      } else if (refundAmount > 0) {
        enqueueBigcapitalPartialRefundIfEnabled(order, refundAmount, {
          idempotencyKey: idem
            ? `partial_refund_${orderId}_${idem}`
            : undefined,
          originatedBy: "accounting.partial_refund",
        }).catch((err) => {
          console.error(
            "[BigcapitalPartialRefund] enqueue:",
            err.message
          );
        });
      }
    }
    if (Number.isFinite(refundAmount) && refundAmount >= 200) {
      await createBackofficeNotificationFromEvent(
        NOTIFICATION_EVENTS.REFUND_LARGE,
        {
          organizationId: String(orgId),
          orderId: String(orderId),
          amount: refundAmount,
          body: `Large refund posted for order ${String(orderId).slice(-8)}: ${refundAmount.toFixed(2)}.`,
        },
      );
    }
    await PosAuditLog.create({
      organization: orgId,
      location: req.locationScopeId || null,
      user: req.user?._id || null,
      action: "refund_issued",
      metadata: {
        orderId: String(orderId),
        refundJournalId: String(populated?._id || ""),
        amount: Number.isFinite(refundAmount) ? refundAmount : Number(amount) || 0,
        nativeGlSkipped,
      },
    });
    res.status(201).json({
      success: true,
      data: {
        refund: populated,
        nativeGlSkipped,
      },
    });
  } catch (e) {
    next(e);
  }
};

const postArPayment = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { customerId, amount, idempotencyKey, allocations } = req.body;
    if (!customerId || !mongoose.Types.ObjectId.isValid(customerId)) {
      return next(createHttpError(400, "customerId is required"));
    }
    const idem = req.get("Idempotency-Key") || idempotencyKey;
    const doc = await accountingService.postArPayment({
      customerId,
      amount: Number(amount),
      userId: req.user?._id,
      idempotencyKey: idem,
      allocations,
      organizationId: orgId,
    });
    const populated = await JournalEntry.findById(doc._id).populate(
      "lines.account",
      "code name type"
    );
    res.status(201).json({ success: true, data: populated });
  } catch (e) {
    next(e);
  }
};

const profitAndLoss = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { start, end, locationId, costCenter } = req.query;
    const pnl = await accountingService.profitAndLoss({
      start,
      end,
      organizationId: orgId,
      locationId,
      costCenter,
    });
    res.status(200).json({ success: true, data: pnl });
  } catch (e) {
    next(e);
  }
};

const cashFlowReport = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { start, end, locationId, costCenter } = req.query;
    const report = await accountingService.cashFlowReport({
      start,
      end,
      organizationId: orgId,
      locationId,
      costCenter,
    });
    res.status(200).json({ success: true, data: report });
  } catch (e) {
    next(e);
  }
};

const balanceSheet = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { asOf, locationId, costCenter } = req.query;
    const bs = await accountingService.balanceSheet({
      asOf,
      organizationId: orgId,
      locationId,
      costCenter,
    });
    res.status(200).json({ success: true, data: bs });
  } catch (e) {
    next(e);
  }
};

const exportJournalsCsv = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { start, end } = req.query;
    const filter = { organization: orgId };
    if (start || end) {
      filter.entryDate = {};
      if (start) filter.entryDate.$gte = new Date(start);
      if (end) filter.entryDate.$lte = new Date(end);
    }
    const entries = await JournalEntry.find(filter)
      .sort({ entryNumber: 1 })
      .populate("lines.account", "code name type");
    const csv = accountingService.journalsToCsvRows(entries);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="journal-export.csv"'
    );
    res.status(200).send(csv);
  } catch (e) {
    next(e);
  }
};

const exportIntegrationJson = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { start, end } = req.query;
    const filter = { organization: orgId };
    if (start || end) {
      filter.entryDate = {};
      if (start) filter.entryDate.$gte = new Date(start);
      if (end) filter.entryDate.$lte = new Date(end);
    }
    const entries = await JournalEntry.find(filter)
      .sort({ entryNumber: 1 })
      .populate("lines.account", "code name type")
      .lean();
    res.status(200).json({
      success: true,
      format: "pos-gl-v1",
      data: entries,
    });
  } catch (e) {
    next(e);
  }
};

const listAuditLogs = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const pag = parsePaginationQuery(req.query);
    const filter = { organization: orgId };
    if (req.query.action) filter.action = req.query.action;
    const base = JournalAuditLog.find(filter)
      .sort({ createdAt: -1 })
      .populate("user", "name email")
      .populate("journalEntry", "entryNumber sourceType memo");

    if (pag.active) {
      const [data, total] = await Promise.all([
        base.clone().skip(pag.skip).limit(pag.limit),
        JournalAuditLog.countDocuments(filter),
      ]);
      return res.status(200).json({
        success: true,
        data,
        page: pag.page,
        limit: pag.limit,
        total,
      });
    }
    const data = await base.limit(200);
    res.status(200).json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

const acknowledgeSync = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { batchId, orderIds, note } = req.body;
    const out = await accountingService.acknowledgeSyncBatch({
      batchId,
      orderIds,
      userId: req.user?._id,
      note,
      organizationId: orgId,
    });
    res.status(201).json({ success: true, data: out });
  } catch (e) {
    next(e);
  }
};

const listFxRates = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const q = { organization: orgId };
    if (req.query.from) q.fromCurrency = String(req.query.from).toUpperCase();
    if (req.query.to) q.toCurrency = String(req.query.to).toUpperCase();
    const list = await FxRate.find(q).sort({ effectiveDate: -1 }).limit(200).lean();
    res.status(200).json({ success: true, data: list });
  } catch (e) {
    next(e);
  }
};

const createFxRate = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { effectiveDate, fromCurrency, toCurrency, rate, note } = req.body;
    if (!fromCurrency || !toCurrency || rate == null) {
      return next(createHttpError(400, "fromCurrency, toCurrency, rate required"));
    }
    const numericRate = Number(rate);
    if (!Number.isFinite(numericRate) || numericRate <= 0) {
      return next(createHttpError(400, "rate must be a positive number"));
    }
    const from = String(fromCurrency).toUpperCase().trim();
    const to = String(toCurrency).toUpperCase().trim();
    if (from === to) {
      return next(createHttpError(400, "fromCurrency and toCurrency must differ"));
    }
    const doc = await FxRate.create({
      organization: orgId,
      effectiveDate: effectiveDate ? new Date(effectiveDate) : new Date(),
      fromCurrency: from,
      toCurrency: to,
      rate: numericRate,
      note: note != null ? String(note).slice(0, 500) : "",
    });
    res.status(201).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};

const updateFxRate = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid id"));
    }
    const { effectiveDate, fromCurrency, toCurrency, rate, note } = req.body;
    if (!fromCurrency || !toCurrency || rate == null) {
      return next(createHttpError(400, "fromCurrency, toCurrency, rate required"));
    }
    const from = String(fromCurrency).toUpperCase().trim();
    const to = String(toCurrency).toUpperCase().trim();
    if (from === to) {
      return next(createHttpError(400, "fromCurrency and toCurrency must differ"));
    }
    const numericRate = Number(rate);
    if (!Number.isFinite(numericRate) || numericRate <= 0) {
      return next(createHttpError(400, "rate must be a positive number"));
    }
    const doc = await FxRate.findOneAndUpdate(
      { _id: id, organization: orgId },
      {
        $set: {
          effectiveDate: effectiveDate ? new Date(effectiveDate) : new Date(),
          fromCurrency: from,
          toCurrency: to,
          rate: numericRate,
          note: note != null ? String(note).slice(0, 500) : "",
        },
      },
      { new: true, runValidators: true }
    )
      .select("effectiveDate fromCurrency toCurrency rate note organization createdAt updatedAt")
      .lean();
    if (!doc) return next(createHttpError(404, "Not found"));
    res.status(200).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};

const deleteFxRate = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid id"));
    }
    const r = await FxRate.findOneAndDelete({
      _id: id,
      organization: orgId,
    });
    if (!r) return next(createHttpError(404, "Not found"));
    res.status(200).json({ success: true, message: "Deleted." });
  } catch (e) {
    next(e);
  }
};

const resolveFx = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { from, to, date } = req.query;
    if (!from || !to) {
      return next(createHttpError(400, "from and to query params required"));
    }
    const r = await accountingService.resolveFxRateFromTable(
      from,
      to,
      date ? new Date(date) : new Date(),
      orgId
    );
    res.status(200).json({
      success: true,
      data: { from, to, rate: r, date: date || new Date().toISOString() },
    });
  } catch (e) {
    next(e);
  }
};

const bootstrapCostLayers = async (req, res, next) => {
  try {
    const inventoryCostService = require("../services/inventoryCostService");
    const out = await inventoryCostService.bootstrapLayersFromStock();
    res.status(200).json({ success: true, data: out });
  } catch (e) {
    next(e);
  }
};

const listPeriods = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const data = await accountingService.listAccountingPeriods(orgId);
    res.status(200).json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

const closePeriod = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { year, month } = req.body;
    const doc = await accountingService.closeAccountingPeriod({
      year,
      month,
      userId: req.user?._id,
      organizationId: orgId,
    });
    res.status(200).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};

const postRetainedEarningsClosing = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { endDate, idempotencyKey } = req.body;
    const idem = req.get("Idempotency-Key") || idempotencyKey;
    const entry = await accountingService.postClosingToRetainedEarnings({
      endDate,
      userId: req.user?._id,
      idempotencyKey: idem,
      organizationId: orgId,
    });
    if (!entry) {
      return res.status(200).json({
        success: true,
        message: "Nothing to close (no P&L balances).",
        data: null,
      });
    }
    const populated = await JournalEntry.findById(entry._id).populate(
      "lines.account",
      "code name type"
    );
    res.status(201).json({ success: true, data: populated });
  } catch (e) {
    next(e);
  }
};

const listInvoices = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const data = await accountingService.listAccountingInvoices({
      status: req.query.status,
      customerId: req.query.customerId,
      limit: req.query.limit,
      organizationId: orgId,
    });
    res.status(200).json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

const createInvoiceFromOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { dueDays } = req.body || {};
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return next(createHttpError(400, "Invalid order id"));
    }
    const inv = await accountingService.issueInvoiceFromOrder({
      orderId,
      dueDays: dueDays != null ? Number(dueDays) : 30,
    });
    await inv.populate({ path: "customer", select: "name phone" });
    res.status(201).json({ success: true, data: inv });
  } catch (e) {
    if (e.message === "Order not found") {
      return next(createHttpError(404, e.message));
    }
    if (e.message === "Order has no customer") {
      return next(createHttpError(400, e.message));
    }
    next(e);
  }
};

const voidInvoice = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid id"));
    }
    const inv = await accountingService.voidAccountingInvoice(id, orgId);
    res.status(200).json({ success: true, data: inv });
  } catch (e) {
    if (e.message === "Invalid invoice id" || e.message === "Invoice not found") {
      return next(createHttpError(404, e.message));
    }
    next(e);
  }
};

const arAging = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const data = await accountingService.arAgingReport({
      asOf: req.query.asOf,
      organizationId: orgId,
    });
    res.status(200).json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

const customerStatement = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { customerId } = req.query;
    if (!customerId || !mongoose.Types.ObjectId.isValid(String(customerId))) {
      return next(createHttpError(400, "Valid customerId query parameter is required."));
    }
    const data = await accountingService.buildCustomerStatement({
      customerId: String(customerId),
      organizationId: orgId,
      start: req.query.start,
      end: req.query.end,
    });
    res.status(200).json({ success: true, data });
  } catch (e) {
    if (e.message === "Customer not found") {
      return next(createHttpError(404, e.message));
    }
    next(e);
  }
};

const customerStatementPdf = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { customerId } = req.query;
    if (!customerId || !mongoose.Types.ObjectId.isValid(String(customerId))) {
      return next(createHttpError(400, "Valid customerId query parameter is required."));
    }
    const data = await accountingService.buildCustomerStatement({
      customerId: String(customerId),
      organizationId: orgId,
      start: req.query.start,
      end: req.query.end,
    });
    const org = await Organization.findById(orgId).select("name").lean();
    const buf = await accountingPdfService.customerStatementToPdfBuffer(data, {
      orgName: org?.name || "",
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="customer-statement-${String(customerId).slice(-8)}.pdf"`,
    );
    res.status(200).send(buf);
  } catch (e) {
    if (e.message === "Customer not found") {
      return next(createHttpError(404, e.message));
    }
    next(e);
  }
};

const supplierStatement = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { supplierId } = req.query;
    if (!supplierId || !mongoose.Types.ObjectId.isValid(String(supplierId))) {
      return next(createHttpError(400, "Valid supplierId query parameter is required."));
    }
    const data = await accountingService.buildSupplierStatement({
      supplierId: String(supplierId),
      organizationId: orgId,
      start: req.query.start,
      end: req.query.end,
    });
    res.status(200).json({ success: true, data });
  } catch (e) {
    if (e.message === "Supplier not found") {
      return next(createHttpError(404, e.message));
    }
    next(e);
  }
};

const supplierStatementPdf = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { supplierId } = req.query;
    if (!supplierId || !mongoose.Types.ObjectId.isValid(String(supplierId))) {
      return next(createHttpError(400, "Valid supplierId query parameter is required."));
    }
    const data = await accountingService.buildSupplierStatement({
      supplierId: String(supplierId),
      organizationId: orgId,
      start: req.query.start,
      end: req.query.end,
    });
    const org = await Organization.findById(orgId).select("name").lean();
    const buf = await accountingPdfService.supplierStatementToPdfBuffer(data, {
      orgName: org?.name || "",
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="supplier-statement-${String(supplierId).slice(-8)}.pdf"`,
    );
    res.status(200).send(buf);
  } catch (e) {
    if (e.message === "Supplier not found") {
      return next(createHttpError(404, e.message));
    }
    next(e);
  }
};

const listSessions = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const pag = parsePaginationQuery(req.query);
    const q = { organization: orgId };
    if (req.query.status === "open" || req.query.status === "closed") {
      q.status = req.query.status;
    }
    const sortBy = String(req.query.sortBy || "openedAt");
    const sortDir = String(req.query.sortDir || "desc").toLowerCase() === "asc" ? 1 : -1;
    let sort = { openedAt: -1 };
    if (sortBy === "sessionNumber") sort = { sessionNumber: sortDir };
    else if (sortBy === "status") sort = { status: sortDir };
    else if (sortBy === "openingFloat") sort = { openingFloat: sortDir };
    else sort = { openedAt: sortDir };

    const base = AccountingSession.find(q)
      .populate("openedBy closedBy", "name email")
      .sort(sort);

    if (pag.active) {
      const [data, total] = await Promise.all([
        base.clone().skip(pag.skip).limit(pag.limit),
        AccountingSession.countDocuments(q),
      ]);
      return res.status(200).json({
        success: true,
        data,
        page: pag.page,
        limit: pag.limit,
        total,
      });
    }

    const list = await base.limit(100);
    res.status(200).json({ success: true, data: list });
  } catch (e) {
    next(e);
  }
};

const openSession = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { openingFloat, location } = req.body;
    const sess = await accountingService.openSession({
      userId: req.user?._id,
      openingFloat: Number(openingFloat) || 0,
      locationId: location,
      organizationId: orgId,
    });
    res.status(201).json({ success: true, data: sess });
  } catch (e) {
    if (e.status === 400) {
      return next(createHttpError(400, e.message));
    }
    next(e);
  }
};

const closeSession = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      closingCountedCash,
      expectedCash,
      discrepancyNote,
      partialCashCounted,
    } = req.body;
    if (closingCountedCash === undefined || closingCountedCash === null) {
      return next(createHttpError(400, "closingCountedCash is required"));
    }
    const out = await accountingService.closeSession({
      sessionId: id,
      userId: req.user?._id,
      closingCountedCash,
      expectedCash,
      discrepancyNote,
      partialCashCounted,
    });
    res.status(200).json({ success: true, data: out });
  } catch (e) {
    if (e.status === 400 || e.status === 404) {
      return next(createHttpError(e.status, e.message));
    }
    next(e);
  }
};

const sessionSummary = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { sessionId } = req.query;
    if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
      return next(createHttpError(400, "sessionId query required"));
    }
    const data = await accountingService.sessionSummaryReport({
      sessionId,
      organizationId: orgId,
    });
    res.status(200).json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

const ExcelJS = require("exceljs");

const exportTrialBalanceXlsx = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { start, end, locationId, costCenter } = req.query;
    const tb = await accountingService.trialBalance({
      start,
      end,
      organizationId: orgId,
      locationId,
      costCenter,
    });
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("TB");
    ws.addRow(["Code", "Name", "Debit", "Credit", "Balance"]);
    for (const r of tb.rows || []) {
      ws.addRow([r.code, r.name, r.debit, r.credit, r.balance]);
    }
    const buf = await wb.xlsx.writeBuffer();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=trial-balance.xlsx"
    );
    res.status(200).send(Buffer.from(buf));
  } catch (e) {
    next(e);
  }
};

const exportTrialBalancePdf = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { start, end, locationId, costCenter } = req.query;
    const tb = await accountingService.trialBalance({
      start,
      end,
      organizationId: orgId,
      locationId,
      costCenter,
    });
    const org = await Organization.findById(orgId).select("name").lean();
    const buf = await accountingPdfService.trialBalanceToPdfBuffer(tb, {
      orgName: org?.name || "",
      periodStart: start ? String(start) : "",
      periodEnd: end ? String(end) : "",
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="trial-balance.pdf"');
    res.status(200).send(buf);
  } catch (e) {
    next(e);
  }
};

const exportJournalsPdf = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { start, end } = req.query;
    const filter = { organization: orgId };
    if (start || end) {
      filter.entryDate = {};
      if (start) filter.entryDate.$gte = new Date(start);
      if (end) filter.entryDate.$lte = new Date(end);
    }
    const entries = await JournalEntry.find(filter)
      .sort({ entryNumber: 1 })
      .limit(500)
      .populate("lines.account", "code name type")
      .lean();
    const org = await Organization.findById(orgId).select("name").lean();
    const buf = await accountingPdfService.journalsToPdfBuffer(entries, {
      orgName: org?.name || "",
      periodStart: start ? String(start) : "",
      periodEnd: end ? String(end) : "",
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="journal-export.pdf"');
    res.status(200).send(buf);
  } catch (e) {
    next(e);
  }
};

const issueGiftCard = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { amount, cashAccountId, idempotencyKey } = req.body;
    const idem = req.get("Idempotency-Key") || idempotencyKey;
    const out = await accountingService.issueGiftCard({
      amount: Number(amount),
      userId: req.user?._id,
      cashAccountId,
      idempotencyKey: idem,
      organizationId: orgId,
    });
    res.status(201).json({ success: true, data: out });
  } catch (e) {
    next(e);
  }
};

const redeemGiftCard = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { code, amount, idempotencyKey } = req.body;
    const idem = req.get("Idempotency-Key") || idempotencyKey;
    const out = await accountingService.redeemGiftCard({
      code,
      amount: Number(amount),
      userId: req.user?._id,
      idempotencyKey: idem,
      organizationId: orgId,
    });
    res.status(201).json({ success: true, data: out });
  } catch (e) {
    next(e);
  }
};

const listGiftCards = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { status, limit, skip } = req.query;
    const out = await accountingService.listGiftCards({
      organizationId: orgId,
      status: typeof status === "string" && status ? status : null,
      limit,
      skip,
    });
    res.status(200).json({ success: true, data: out });
  } catch (e) {
    next(e);
  }
};

const listBankStatements = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const list = await BankStatementLine.find({ organization: orgId })
      .sort({ postedAt: -1 })
      .limit(200);
    res.status(200).json({ success: true, data: list });
  } catch (e) {
    next(e);
  }
};

const matchBankLine = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { lineId, journalLineId } = req.body;
    const doc = await accountingService.matchBankStatementLine(lineId, journalLineId, orgId);
    res.status(200).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};

const getBankMatchingSuggestions = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    const suggestions = await accountingService.getMatchingSuggestionsForBankLine(id, orgId);
    res.status(200).json({ success: true, data: suggestions });
  } catch (e) {
    next(e);
  }
};

const getBankReconciliationReport = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const report = await accountingService.bankReconciliationReport(orgId);
    res.status(200).json({ success: true, data: report });
  } catch (e) {
    next(e);
  }
};

const accountLedger = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    const { start, end } = req.query;
    const ledger = await accountingService.accountLedger(id, { start, end, organizationId: orgId });
    res.status(200).json({ success: true, data: ledger });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/accounting/bank/statements/import — multipart/form-data, `file=<csv>`.
 * CSV v1 contract is documented in `acc&invetmissing/ACCOUNTING.md §9`.
 */
const importBankStatementsCsv = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    if (!req.file || !req.file.buffer) {
      throw createHttpError(400, "Upload a CSV file in the `file` field.");
    }
    const result = await bankCsvImportService.importBankCsv(req.file.buffer, orgId);
    res.status(200).json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};

const listRecurringTemplates = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const list = await accountingService.listRecurringJournalTemplates(orgId);
    res.status(200).json({ success: true, data: list });
  } catch (e) {
    next(e);
  }
};

const createRecurringTemplate = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const doc = await accountingService.createRecurringJournalTemplate(req.body, orgId);
    res.status(201).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};

const updateRecurringTemplate = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    const doc = await accountingService.updateRecurringJournalTemplate(id, req.body, orgId);
    res.status(200).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};

const deleteRecurringTemplate = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    await accountingService.deleteRecurringJournalTemplate(id, orgId);
    res.status(200).json({ success: true, message: "Template deleted" });
  } catch (e) {
    next(e);
  }
};

const runRecurringTemplate = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    const out = await accountingService.runRecurringJournalTemplate({
      templateId: id,
      organizationId: orgId,
      userId: req.user?._id,
    });
    res.status(201).json({
      success: true,
      data: {
        entry: out.entry,
        reused: out.reused,
        template: out.template,
      },
    });
  } catch (e) {
    next(e);
  }
};

const runRecurringInvoice = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    const out = await accountingService.runRecurringInvoiceTemplate({
      templateId: id,
      organizationId: orgId,
      userId: req.user?._id,
    });
    res.status(201).json({
      success: true,
      data: {
        invoice: out.invoice,
        template: out.template,
      },
    });
  } catch (e) {
    next(e);
  }
};

const ensureDefaults = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const out = await accountingService.ensureDefaultAccountsAndConfig(orgId);
    res.status(200).json({
      success: true,
      message: "Defaults ensured.",
      data: {
        configId: out.config._id,
        accountCodes: Object.keys(out.accounts),
      },
    });
  } catch (e) {
    next(e);
  }
};

const budgetVsActual = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { fiscalYear, periodMonth } = req.query;
    if (!fiscalYear || !periodMonth) {
      return next(createHttpError(400, "fiscalYear and periodMonth are required."));
    }
    const data = await accountingService.budgetVsActual(orgId, {
      fiscalYear: Number(fiscalYear),
      periodMonth: Number(periodMonth)
    });
    res.status(200).json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

const listBudgets = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { year } = req.query;
    const q = { organization: orgId };
    if (year) q.fiscalYear = Number(year);
    const data = await Budget.find(q).populate("accountId", "code name").lean();
    res.status(200).json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

const createBudget = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const doc = new Budget({ ...req.body, organization: orgId });
    await doc.save();
    res.status(201).json({ success: true, data: doc });
  } catch (e) {
    if (e && e.code === 11000) {
      return next(
        createHttpError(
          409,
          "A budget already exists for this account and fiscal month. Edit or remove the existing line.",
        ),
      );
    }
    next(e);
  }
};

const deleteBudget = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    await Budget.deleteOne({ _id: id, organization: orgId });
    res.status(200).json({ success: true, message: "Budget deleted." });
  } catch (e) {
    next(e);
  }
};

const BUDGET_PATCH_FIELDS = ["name", "budgetedAmount", "accountId", "fiscalYear", "periodMonth", "notes", "status"];

function pickBudgetPatch(body) {
  const patch = {};
  for (const k of BUDGET_PATCH_FIELDS) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  return patch;
}

async function assertPeriodOpenOrThrow(orgId, year, month) {
  if (!year || !month) return;
  const period = await AccountingPeriod.findOne({
    organization: orgId,
    year: Number(year),
    month: Number(month),
  }).lean();
  if (period && period.status === "closed") {
    throw createHttpError(409, `Accounting period ${year}-${String(month).padStart(2, "0")} is closed.`);
  }
}

const updateBudget = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    const patch = pickBudgetPatch(req.body);
    if (Object.keys(patch).length === 0) {
      throw createHttpError(400, "No valid fields to update.");
    }
    const existing = await Budget.findOne({ _id: id, organization: orgId });
    if (!existing) throw createHttpError(404, "Budget not found.");
    await assertPeriodOpenOrThrow(
      orgId,
      patch.fiscalYear ?? existing.fiscalYear,
      patch.periodMonth ?? existing.periodMonth,
    );
    const doc = await Budget.findOneAndUpdate(
      { _id: id, organization: orgId },
      { $set: patch },
      { new: true, runValidators: true },
    ).populate("accountId", "code name");
    res.status(200).json({ success: true, data: doc });
  } catch (e) {
    if (e && e.code === 11000) {
      return next(
        createHttpError(
          409,
          "A budget already exists for this account and fiscal month. Choose a different account or period.",
        ),
      );
    }
    next(e);
  }
};

const listRecurringInvoices = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const list = await RecurringInvoiceTemplate.find({ organization: orgId })
      .populate("customer", "name email vatNumber phone isBillingCustomer");
    res.status(200).json({ success: true, data: list });
  } catch (e) {
    next(e);
  }
};

async function assertRecurringInvoiceCustomerBillable(customerId, organizationId) {
  if (!mongoose.Types.ObjectId.isValid(customerId)) {
    throw createHttpError(400, "Valid billing customer is required.");
  }
  const customer = await Customer.findOne({ _id: customerId, organization: organizationId })
    .select("name email vatNumber isBillingCustomer")
    .lean();
  if (!customer) {
    throw createHttpError(404, "Billing customer not found.");
  }
  const hasBillingIdentity =
    (typeof customer.email === "string" && customer.email.trim().length > 0) ||
    (typeof customer.vatNumber === "string" && customer.vatNumber.trim().length > 0);
  const billableFlagOk = customer.isBillingCustomer !== false;
  if (!hasBillingIdentity || !billableFlagOk) {
    throw createHttpError(
      400,
      "Billing customer must be marked billable and have at least an email or VAT number.",
    );
  }
}

function isValidIanaTimezone(value) {
  if (!value || typeof value !== "string") return false;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function assertRecurringInvoiceTimezoneOrThrow(timezone) {
  if (timezone === undefined || timezone === null || timezone === "") return;
  if (!isValidIanaTimezone(String(timezone).trim())) {
    throw createHttpError(400, "Invalid timezone. Use a valid IANA timezone (e.g. UTC, Asia/Beirut).");
  }
}

const createRecurringInvoiceTemplate = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    await assertRecurringInvoiceCustomerBillable(req.body.customer, orgId);
    assertRecurringInvoiceTimezoneOrThrow(req.body.timezone);
    const templateLines = Array.isArray(req.body.templateLines) ? req.body.templateLines : [];
    const doc = new RecurringInvoiceTemplate({
      ...req.body,
      organization: orgId,
      templateLines,
      templateLinesCount: templateLines.length,
    });
    if (doc.startAt && doc.endAt && doc.endAt < doc.startAt) {
      return next(createHttpError(400, "endAt must be after startAt."));
    }
    await doc.save();
    res.status(201).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};

const updateRecurringInvoiceTemplate = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    const allowed = [
      "customer",
      "frequency",
      "startAt",
      "endAt",
      "nextIssueAt",
      "isActive",
      "status",
      "timezone",
      "dueDays",
      "currency",
      "templateLines",
      "notes",
    ];
    const patch = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    }
    if (Object.keys(patch).length === 0) {
      return next(createHttpError(400, "No valid fields to update."));
    }
    if (patch.customer !== undefined) {
      await assertRecurringInvoiceCustomerBillable(patch.customer, orgId);
    }
    if (patch.timezone !== undefined) {
      assertRecurringInvoiceTimezoneOrThrow(patch.timezone);
    }
    if (patch.startAt !== undefined || patch.endAt !== undefined) {
      const existing = await RecurringInvoiceTemplate.findOne({ _id: id, organization: orgId })
        .select("startAt endAt")
        .lean();
      if (!existing) {
        return next(createHttpError(404, "Recurring invoice template not found."));
      }
      const startAtCandidate = patch.startAt ?? existing.startAt;
      const endAtCandidate = patch.endAt ?? existing.endAt;
      if (startAtCandidate != null && endAtCandidate != null) {
      const start = new Date(startAtCandidate);
      const end = new Date(endAtCandidate);
      if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end < start) {
        return next(createHttpError(400, "endAt must be after startAt."));
      }
      }
    }
    if (patch.templateLines != null) {
      patch.templateLinesCount = Array.isArray(patch.templateLines) ? patch.templateLines.length : 0;
    }
    const doc = await RecurringInvoiceTemplate.findOneAndUpdate(
      { _id: id, organization: orgId },
      { $set: patch },
      { new: true, runValidators: true }
    ).populate("customer", "name email vatNumber phone isBillingCustomer");
    if (!doc) {
      return next(createHttpError(404, "Recurring invoice template not found."));
    }
    res.status(200).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};

const previewRecurringInvoice = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const body = req.body || {};
    assertRecurringInvoiceTimezoneOrThrow(body.timezone);
    await assertRecurringInvoiceCustomerBillable(body.customer, orgId);
    const data = await accountingService.previewRecurringInvoiceSchedule({
      organizationId: orgId,
      customer: body.customer,
      frequency: body.frequency,
      startAt: body.startAt,
      endAt: body.endAt,
      nextIssueAt: body.nextIssueAt,
      dueDays: body.dueDays,
      timezone: body.timezone,
      currency: body.currency,
      templateLines: body.templateLines,
      count: body.count,
    });
    res.status(200).json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

const deleteRecurringInvoiceTemplate = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    await RecurringInvoiceTemplate.deleteOne({ _id: id, organization: orgId });
    res.status(200).json({ success: true, message: "Template deleted." });
  } catch (e) {
    next(e);
  }
};

/**
 * @param {import("mongoose").Types.ObjectId|string} parentOrgId
 * @param {string|undefined} childOrganizationIds
 */
async function parseChildOrgIdsForConsolidation(parentOrgId, childOrganizationIds) {
  const raw =
    typeof childOrganizationIds === "string" ? childOrganizationIds.trim() : "";
  let ids = [];
  if (!raw) {
    ids = await Organization.find({ parentOrganization: parentOrgId }).distinct("_id");
  } else {
    ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  const oids = ids
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(String(id)));
  if (oids.length === 0) {
    throw createHttpError(
      400,
      "Provide childOrganizationIds as comma-separated ids, or set parentOrganization on child orgs."
    );
  }
  const count = await Organization.countDocuments({
    _id: { $in: oids },
    parentOrganization: parentOrgId,
  });
  if (count !== oids.length) {
    throw createHttpError(
      403,
      "Each organization id must be a direct child of your tenant."
    );
  }
  return oids;
}

const listConsolidationChildOrganizations = async (req, res, next) => {
  try {
    const parentOrgId = assertTenantOrganization(req);
    const kids = await Organization.find({ parentOrganization: parentOrgId })
      .select("name slug lifecycle")
      .sort({ name: 1 })
      .lean();
    res.status(200).json({ success: true, data: kids });
  } catch (e) {
    next(e);
  }
};

const consolidatedTrialBalanceReport = async (req, res, next) => {
  try {
    const parentOrgId = assertTenantOrganization(req);
    const { start, end, costCenter, childOrganizationIds } = req.query;
    const childIds = await parseChildOrgIdsForConsolidation(
      parentOrgId,
      typeof childOrganizationIds === "string" ? childOrganizationIds : undefined
    );
    const data = await accountingService.consolidatedTrialBalance({
      start,
      end,
      costCenter,
      childOrganizationIds: childIds,
    });
    res.status(200).json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

const consolidatedProfitAndLossReport = async (req, res, next) => {
  try {
    const parentOrgId = assertTenantOrganization(req);
    const { start, end, costCenter, childOrganizationIds } = req.query;
    const childIds = await parseChildOrgIdsForConsolidation(
      parentOrgId,
      typeof childOrganizationIds === "string" ? childOrganizationIds : undefined
    );
    const data = await accountingService.consolidatedProfitAndLoss({
      start,
      end,
      costCenter,
      childOrganizationIds: childIds,
    });
    res.status(200).json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

const consolidatedBalanceSheetReport = async (req, res, next) => {
  try {
    const parentOrgId = assertTenantOrganization(req);
    const { asOf, costCenter, childOrganizationIds } = req.query;
    const childIds = await parseChildOrgIdsForConsolidation(
      parentOrgId,
      typeof childOrganizationIds === "string" ? childOrganizationIds : undefined
    );
    const data = await accountingService.consolidatedBalanceSheet({
      asOf,
      costCenter,
      childOrganizationIds: childIds,
    });
    res.status(200).json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

module.exports = {
  listAccounts,
  createAccount,
  updateAccount,
  getConfig,
  updateConfig,
  listJournalEntries,
  getJournalEntry,
  postManualJournal,
  trialBalance,
  repostOrder,
  reverseOrder,
  postRefund,
  postArPayment,
  profitAndLoss,
  balanceSheet,
  exportJournalsCsv,
  exportJournalsPdf,
  exportIntegrationJson,
  listAuditLogs,
  acknowledgeSync,
  listFxRates,
  createFxRate,
  updateFxRate,
  deleteFxRate,
  resolveFx,
  bootstrapCostLayers,
  listPeriods,
  closePeriod,
  postRetainedEarningsClosing,
  listInvoices,
  createInvoiceFromOrder,
  voidInvoice,
  arAging,
  customerStatement,
  customerStatementPdf,
  supplierStatement,
  supplierStatementPdf,
  listSessions,
  openSession,
  closeSession,
  ensureDefaults,
  sessionSummary,
  exportTrialBalanceXlsx,
  exportTrialBalancePdf,
  issueGiftCard,
  redeemGiftCard,
  listGiftCards,
  listBankStatements,
  importBankStatementsCsv,
  cashFlowReport,
  matchBankLine,
  getBankMatchingSuggestions,
  getBankReconciliationReport,
  accountLedger,
  listRecurringTemplates,
  createRecurringTemplate,
  updateRecurringTemplate,
  deleteRecurringTemplate,
  runRecurringTemplate,
  runRecurringInvoice,
  budgetVsActual,
  listBudgets,
  createBudget,
  updateBudget,
  deleteBudget,
  listRecurringInvoices,
  createRecurringInvoiceTemplate,
  previewRecurringInvoice,
  updateRecurringInvoiceTemplate,
  deleteRecurringInvoiceTemplate,
  listConsolidationChildOrganizations,
  consolidatedTrialBalanceReport,
  consolidatedProfitAndLossReport,
  consolidatedBalanceSheetReport,
  runAutomationHooks,
  testAutomationWebhook,
};
