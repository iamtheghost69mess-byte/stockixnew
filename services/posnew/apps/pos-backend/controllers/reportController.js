const { parseReportQuery } = require("../utils/reportRange");
const { toCsv } = require("../utils/csv");
const {
  getSalesReport,
  getTopItemsReport,
  getPaymentMethodsReport,
  getFoodCostReport,
  getStaffReport,
  getTablesReport,
  getBranchComparisonReport,
  getVoidsReport,
  getSalesByCategoryReport,
  getExpenseBreakdownReport,
} = require("../services/reportService");
const DiscountAudit = require("../models/discountAuditModel");
const Order = require("../models/orderModel");
const PosAuditLog = require("../models/posAuditLogModel");
const { parsePaginationQuery } = require("../utils/listPagination");
const mongoose = require("mongoose");
const JournalEntry = require("../models/journalEntryModel");
const AccountingConfig = require("../models/accountingConfigModel");
const Location = require("../models/locationModel");
const Organization = require("../models/organizationModel");
const accountingPdfService = require("../services/accountingPdfService");

function wantsCsv(req) {
  return String(req.query.format || "").toLowerCase() === "csv";
}

const sales = async (req, res, next) => {
  try {
    const { from, to, groupBy, tz } = parseReportQuery(req.query);
    const data = await getSalesReport(
      from,
      to,
      groupBy,
      tz,
      req.locationScopeId,
      req.tenantOrganizationId
    );
    if (wantsCsv(req)) {
      const { escapeCell } = require("../utils/csv");
      const lines = [
        "row,totalRevenue,orderCount,averageOrderValue",
        `summary,${escapeCell(data.summary.totalRevenue)},${escapeCell(
          data.summary.orderCount
        )},${escapeCell(data.summary.averageOrderValue)}`,
        "period,revenue,orderCount",
        ...data.buckets.map(
          (b) =>
            `${escapeCell(b.period)},${escapeCell(b.revenue)},${escapeCell(
              b.orderCount
            )}`
        ),
      ];
      const csv = lines.join("\r\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="sales-report.csv"'
      );
      return res.status(200).send(csv);
    }
    res.status(200).json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

const topItems = async (req, res, next) => {
  try {
    const { from, to } = parseReportQuery(req.query);
    const data = await getTopItemsReport(
      from,
      to,
      req.locationScopeId,
      req.tenantOrganizationId
    );
    if (wantsCsv(req)) {
      const csv = toCsv(data.items, [
        { header: "menuItemId", key: "menuItemId" },
        { header: "name", key: "name" },
        { header: "quantity", key: "quantity" },
        { header: "revenue", key: "revenue" },
        { header: "percentOfRevenue", key: "percentOfRevenue" },
      ]);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="top-items.csv"'
      );
      return res.status(200).send(csv);
    }
    res.status(200).json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

const paymentMethods = async (req, res, next) => {
  try {
    const { from, to } = parseReportQuery(req.query);
    const data = await getPaymentMethodsReport(
      from,
      to,
      req.locationScopeId,
      req.tenantOrganizationId
    );
    if (wantsCsv(req)) {
      const csv = toCsv(data.breakdown, [
        { header: "method", key: "method" },
        { header: "amount", key: "amount" },
        { header: "orderCount", key: "orderCount" },
        { header: "percentOfTotal", key: "percentOfTotal" },
      ]);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="payment-methods.csv"'
      );
      return res.status(200).send(csv);
    }
    res.status(200).json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

const foodCost = async (req, res, next) => {
  try {
    const { from, to } = parseReportQuery(req.query);
    const data = await getFoodCostReport(
      from,
      to,
      req.tenantOrganizationId
    );
    if (wantsCsv(req)) {
      const ingCsv = toCsv(data.ingredients, [
        { header: "name", key: "name" },
        { header: "unit", key: "unit" },
        { header: "unitCost", key: "unitCost" },
        { header: "quantityConsumed", key: "quantityConsumed" },
        { header: "consumedCostValue", key: "consumedCostValue" },
        { header: "openingStockEstimate", key: "openingStockEstimate" },
        { header: "currentStock", key: "currentStock" },
      ]);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="food-cost-ingredients.csv"'
      );
      return res.status(200).send(ingCsv);
    }
    res.status(200).json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

const staff = async (req, res, next) => {
  try {
    const { from, to } = parseReportQuery(req.query);
    const data = await getStaffReport(
      from,
      to,
      req.locationScopeId,
      req.tenantOrganizationId
    );
    if (wantsCsv(req)) {
      const csv = toCsv(data.staff, [
        { header: "name", key: "name" },
        { header: "role", key: "role" },
        { header: "orderCount", key: "orderCount" },
        { header: "revenue", key: "revenue" },
        { header: "tips", key: "tips" },
        { header: "averageOrderValue", key: "averageOrderValue" },
      ]);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="staff-report.csv"'
      );
      return res.status(200).send(csv);
    }
    res.status(200).json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

const tables = async (req, res, next) => {
  try {
    const { from, to } = parseReportQuery(req.query);
    const data = await getTablesReport(
      from,
      to,
      req.locationScopeId,
      req.tenantOrganizationId
    );
    if (wantsCsv(req)) {
      const csv = toCsv(data.tables, [
        { header: "label", key: "label" },
        { header: "section", key: "section" },
        { header: "covers", key: "covers" },
        { header: "revenue", key: "revenue" },
        { header: "avgDwellMinutes", key: "avgDwellMinutes" },
      ]);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="tables-report.csv"'
      );
      return res.status(200).send(csv);
    }
    res.status(200).json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

function round2Audit(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Manual discount audit log (table #, before/after, who, when). */
const discountAuditList = async (req, res, next) => {
  try {
    const q = {};
    if (req.tenantOrganizationId) {
      q.organization = req.tenantOrganizationId;
    }
    if (req.locationScopeId) {
      q.$or = [
        { location: req.locationScopeId },
        { location: null },
        { location: { $exists: false } },
      ];
    }
    const fromRaw = req.query.from ? new Date(String(req.query.from)) : null;
    const toRaw = req.query.to ? new Date(String(req.query.to)) : null;
    const createdAt = {};
    if (fromRaw && !Number.isNaN(fromRaw.getTime())) {
      const d = new Date(fromRaw);
      d.setHours(0, 0, 0, 0);
      createdAt.$gte = d;
    }
    if (toRaw && !Number.isNaN(toRaw.getTime())) {
      const d = new Date(toRaw);
      d.setHours(23, 59, 59, 999);
      createdAt.$lte = d;
    }
    if (Object.keys(createdAt).length) {
      q.createdAt = createdAt;
    }
    const pag = parsePaginationQuery(req.query);
    const base = DiscountAudit.find(q)
      .sort({ createdAt: -1 })
      .populate("appliedBy", "name role");

    const [rows, total, sumAgg] = await Promise.all([
      base.clone().skip(pag.skip).limit(pag.limit).lean(),
      DiscountAudit.countDocuments(q),
      DiscountAudit.aggregate([
        { $match: q },
        {
          $group: {
            _id: null,
            totalDiscountAmount: { $sum: "$discountAmount" },
          },
        },
      ]),
    ]);
    const totalDiscountAmount = round2Audit(sumAgg[0]?.totalDiscountAmount || 0);
    let paidRevenueInPeriod = null;
    let revenueImpactPercent = null;
    if (
      req.tenantOrganizationId &&
      fromRaw &&
      toRaw &&
      !Number.isNaN(fromRaw.getTime()) &&
      !Number.isNaN(toRaw.getTime())
    ) {
      const start = new Date(fromRaw);
      start.setHours(0, 0, 0, 0);
      const end = new Date(toRaw);
      end.setHours(23, 59, 59, 999);
      const match = {
        organization: req.tenantOrganizationId,
        orderStatus: "paid",
        paidAt: { $gte: start, $lte: end },
      };
      if (req.locationScopeId && !req.locationScopeAll) {
        match.location = req.locationScopeId;
      }
      const revRows = await Order.aggregate([
        { $match: match },
        { $group: { _id: null, rev: { $sum: "$bills.totalWithTax" } } },
      ]);
      paidRevenueInPeriod = round2Audit(revRows[0]?.rev || 0);
      revenueImpactPercent =
        paidRevenueInPeriod > 0
          ? round2Audit((totalDiscountAmount / paidRevenueInPeriod) * 100)
          : null;
    }
    const data = rows.map((row) => {
      const applied = row.appliedBy;
      const discountedBy =
        applied && typeof applied === "object" && applied.name
          ? String(applied.name).trim()
          : "";
      return { ...row, discountedBy };
    });
    res.status(200).json({
      success: true,
      data,
      page: pag.page,
      limit: pag.limit,
      total,
      summary: {
        totalDiscountAmount,
        totalEntries: total,
        paidRevenueInPeriod,
        revenueImpactPercent,
      },
    });
  } catch (e) {
    next(e);
  }
};

/** POS-side audit trail (voids, discounts, logins, etc.) with filters. */
const posAuditList = async (req, res, next) => {
  try {
    const q = {};
    if (req.tenantOrganizationId) {
      q.organization = req.tenantOrganizationId;
    }
    if (req.locationScopeId) {
      q.$or = [
        { location: req.locationScopeId },
        { location: null },
        { location: { $exists: false } },
      ];
    }
    const fromRaw = req.query.from ? new Date(String(req.query.from)) : null;
    const toRaw = req.query.to ? new Date(String(req.query.to)) : null;
    if (fromRaw || toRaw) {
      q.createdAt = {};
      if (fromRaw && !Number.isNaN(fromRaw.getTime())) {
        const d = new Date(fromRaw);
        d.setHours(0, 0, 0, 0);
        q.createdAt.$gte = d;
      }
      if (toRaw && !Number.isNaN(toRaw.getTime())) {
        const d = new Date(toRaw);
        d.setHours(23, 59, 59, 999);
        q.createdAt.$lte = d;
      }
    }
    const action = String(req.query.action || "").trim();
    if (action) q.action = action;
    const userFilter = String(req.query.userId || "").trim();
    if (userFilter && mongoose.Types.ObjectId.isValid(userFilter)) {
      q.user = new mongoose.Types.ObjectId(userFilter);
    }
    const pag = parsePaginationQuery(req.query);
    const base = PosAuditLog.find(q)
      .sort({ createdAt: -1 })
      .populate("user", "name username role")
      .populate("location", "name code");

    const [rows, total] = await Promise.all([
      base.clone().skip(pag.skip).limit(pag.limit).lean(),
      PosAuditLog.countDocuments(q),
    ]);
    const data = rows.map((row) => ({
      id: String(row._id),
      action: row.action,
      metadata: row.metadata || {},
      ip: row.ip || "",
      createdAt: row.createdAt,
      user: row.user
        ? {
            id: String(row.user._id),
            name: row.user.name,
            username: row.user.username,
            role: row.user.role,
          }
        : null,
      location: row.location
        ? {
            id: String(row.location._id),
            name: row.location.name,
            code: row.location.code,
          }
        : null,
    }));
    res.status(200).json({
      success: true,
      data,
      page: pag.page,
      limit: pag.limit,
      total,
    });
  } catch (e) {
    next(e);
  }
};

async function resolveVatRatePercent(cfg, locationId) {
  if (locationId && mongoose.Types.ObjectId.isValid(String(locationId))) {
    const loc = await Location.findById(locationId).select("vatRate").lean();
    if (loc && Number.isFinite(Number(loc.vatRate)) && Number(loc.vatRate) > 0) {
      return Number(loc.vatRate);
    }
  }
  const branchRows = Array.isArray(cfg?.branchVatRates) ? cfg.branchVatRates : [];
  const branch = branchRows.find(
    (row) => locationId && String(row.location) === String(locationId)
  );
  if (branch && Number.isFinite(Number(branch.ratePercent))) {
    return Number(branch.ratePercent);
  }
  const salesRate = (cfg?.taxRates || []).find(
    (row) => String(row.kind || "sales").toLowerCase() !== "withholding"
  );
  if (salesRate && Number.isFinite(Number(salesRate.rate))) {
    const raw = Number(salesRate.rate);
    return raw <= 1 ? raw * 100 : raw;
  }
  return 0;
}

function monthWindowUtc(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || y < 2000 || y > 2100) {
    throw new Error("year must be an integer between 2000 and 2100");
  }
  if (!Number.isInteger(m) || m < 1 || m > 12) {
    throw new Error("month must be an integer between 1 and 12");
  }
  const from = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const to = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
  return { from, to, year: y, month: m };
}

async function buildVatReportData(params) {
  const { year, month, organizationId, locationId } = params;
  const { from, to } = monthWindowUtc(year, month);
  const cfg = await AccountingConfig.findOne({ organization: organizationId }).select(
    "defaultTaxPayableAccount branchVatRates taxRates"
  );
  const vatAccountId = cfg?.defaultTaxPayableAccount || null;
  if (!vatAccountId) {
    throw new Error("defaultTaxPayableAccount must be configured for VAT report.");
  }
  const match = {
    organization: new mongoose.Types.ObjectId(String(organizationId)),
    entryDate: { $gte: from, $lte: to },
    ...(locationId
      ? { location: new mongoose.Types.ObjectId(String(locationId)) }
      : {}),
  };
  const agg = await JournalEntry.aggregate([
    { $match: match },
    { $unwind: "$lines" },
    {
      $match: {
        "lines.account": new mongoose.Types.ObjectId(String(vatAccountId)),
      },
    },
    {
      $group: {
        _id: null,
        totalVatCredit: { $sum: { $ifNull: ["$lines.credit", 0] } },
        totalVatDebit: { $sum: { $ifNull: ["$lines.debit", 0] } },
      },
    },
  ]);
  const vatCollected = Math.max(
    0,
    Number(
      (
        Number(agg[0]?.totalVatCredit || 0) - Number(agg[0]?.totalVatDebit || 0)
      ).toFixed(2)
    )
  );
  const vatRate = Number(
    (await resolveVatRatePercent(cfg, locationId)).toFixed(2)
  );
  const netSales =
    vatRate > 0 ? Number((vatCollected / (vatRate / 100)).toFixed(2)) : 0;
  const totalSales = Number((netSales + vatCollected).toFixed(2));
  return {
    period: `${Number(year)}-${String(Number(month)).padStart(2, "0")}`,
    locationId: locationId || null,
    vatRate,
    totalSales,
    netSales,
    totalVATCollected: vatCollected,
  };
}

const vatReport = async (req, res, next) => {
  try {
    const payload = await buildVatReportData({
      year: req.query.year,
      month: req.query.month,
      organizationId: req.tenantOrganizationId,
      locationId: req.locationScopeId,
    });
    return res.status(200).json({ success: true, data: payload });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("year must be")) {
        error.status = 400;
      }
      if (error.message.includes("month must be")) {
        error.status = 400;
      }
    }
    next(error);
  }
};

const vatReportPdf = async (req, res, next) => {
  try {
    const reportData = await buildVatReportData({
      year: req.query.year,
      month: req.query.month,
      organizationId: req.tenantOrganizationId,
      locationId: req.locationScopeId,
    });
    const org = req.tenantOrganizationId
      ? await Organization.findById(req.tenantOrganizationId).select("name").lean()
      : null;
    const pdf = await accountingPdfService.vatReportToPdfBuffer(reportData, {
      orgName: org?.name || "",
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="vat-report-${reportData.period}.pdf"`
    );
    return res.status(200).send(pdf);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("year must be")) error.status = 400;
      if (error.message.includes("month must be")) error.status = 400;
    }
    next(error);
  }
};

const branchComparison = async (req, res, next) => {
  try {
    if (!req.locationScopeAll) {
      const error = new Error(
        "Branch comparison requires X-Location-Id: all and admin scope."
      );
      error.status = 403;
      throw error;
    }
    const { from, to } = parseReportQuery(req.query);
    const data = await getBranchComparisonReport(
      from,
      to,
      req.tenantOrganizationId
    );
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const voidsReport = async (req, res, next) => {
  try {
    const { from, to } = parseReportQuery(req.query);
    const userId =
      req.query.userId && mongoose.Types.ObjectId.isValid(String(req.query.userId))
        ? new mongoose.Types.ObjectId(String(req.query.userId))
        : null;
    const data = await getVoidsReport({
      from,
      to,
      organizationId: req.tenantOrganizationId,
      locationScopeId: req.locationScopeId,
      userId,
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const salesByCategory = async (req, res, next) => {
  try {
    const { from, to } = parseReportQuery(req.query);
    const data = await getSalesByCategoryReport(
      from,
      to,
      req.locationScopeId,
      req.tenantOrganizationId
    );
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const expenses = async (req, res, next) => {
  try {
    const { from, to } = parseReportQuery(req.query);
    const data = await getExpenseBreakdownReport({
      from,
      to,
      organizationId: req.tenantOrganizationId,
      locationId: req.locationScopeId,
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  sales,
  topItems,
  paymentMethods,
  foodCost,
  staff,
  tables,
  discountAuditList,
  posAuditList,
  vatReport,
  vatReportPdf,
  branchComparison,
  voidsReport,
  salesByCategory,
  expenses,
};
