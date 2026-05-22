const Order = require("../models/orderModel");
const QrScanEvent = require("../models/qrScanEventModel");
const AccountingConfig = require("../models/accountingConfigModel");
const PosAuditLog = require("../models/posAuditLogModel");
const Table = require("../models/tableModel");
const {
  paidOrdersInRangePipeline,
  getSalesReport,
} = require("./reportService");
const { listLowStockIngredients } = require("./inventoryService");
const {
  sumCostAmountForOrder,
  computeOrderCogsCost,
} = require("./accountingService");
const { computeStandardCogsCostFromOrder } = require("./cogsFromOrder");
const { locationMatchForOrders } = require("../utils/tableScope");
const {
  parseDashboardRange,
  listDashboardDayKeys,
  ymdInTz,
} = require("../utils/dashboardRange");

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Percent change vs prior window. Prior zero → 0 (stable contract for UI).
 *
 * @param {number} current
 * @param {number} prior
 */
function percentChange(current, prior) {
  const p = Number(prior);
  const c = Number(current);
  if (!Number.isFinite(p) || p === 0) return 0;
  return round2(((c - p) / p) * 100);
}

/**
 * @param {import("mongoose").Types.ObjectId|null|undefined} locationScopeId
 * @returns {Record<string, unknown>|null}
 */
function visitorLocationMatch(locationScopeId) {
  return locationMatchForOrders(locationScopeId);
}

/**
 * @param {import("mongoose").Types.ObjectId} organizationId
 * @param {Date} from
 * @param {Date} to
 * @param {string} tz
 * @param {import("mongoose").Types.ObjectId|null|undefined} locationScopeId
 * @returns {Promise<Map<string, number>>}
 */
async function aggregateVisitorsByDay(
  organizationId,
  from,
  to,
  tz,
  locationScopeId
) {
  /** @type {import("mongoose").PipelineStage[]} */
  const pipe = [
    {
      $match: {
        organization: organizationId,
        scannedAt: { $gte: from, $lte: to },
      },
    },
  ];
  const loc = visitorLocationMatch(locationScopeId);
  if (loc) {
    pipe.push({ $match: loc });
  }
  pipe.push(
    {
      $group: {
        _id: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$scannedAt",
            timezone: tz,
          },
        },
        visitors: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } }
  );
  const rows = await QrScanEvent.aggregate(pipe);
  const map = new Map();
  for (const r of rows) {
    map.set(String(r._id), Number(r.visitors) || 0);
  }
  return map;
}

/**
 * @param {import("mongoose").Types.ObjectId} organizationId
 * @param {Date} from
 * @param {Date} to
 * @param {import("mongoose").Types.ObjectId|null|undefined} locationScopeId
 */
async function countVisitorsTotal(
  organizationId,
  from,
  to,
  locationScopeId
) {
  const q = {
    organization: organizationId,
    scannedAt: { $gte: from, $lte: to },
  };
  const loc = visitorLocationMatch(locationScopeId);
  if (loc) {
    return QrScanEvent.countDocuments({ $and: [q, loc] });
  }
  return QrScanEvent.countDocuments(q);
}

/**
 * COGS per paid order, bucketed by sale day in `tz`.
 * Performance follow-up: stockmovements + orders aggregation for high-volume tenants.
 *
 * @param {import("mongoose").Types.ObjectId} organizationId
 * @param {Date} from
 * @param {Date} to
 * @param {string} tz
 * @param {import("mongoose").Types.ObjectId|null|undefined} locationScopeId
 * @param {string} defaultCostMethod
 * @returns {Promise<{ total: number; byDay: Map<string, number> }>}
 */
async function computeCogsBucketed(
  organizationId,
  from,
  to,
  tz,
  locationScopeId,
  defaultCostMethod
) {
  const pipe = [
    ...paidOrdersInRangePipeline(from, to, locationScopeId, organizationId),
    { $project: { saleTs: 1, items: 1 } },
  ];
  const orders = await Order.aggregate(pipe);
  const standardFallbackById = new Map();
  if (String(defaultCostMethod).toLowerCase() === "standard" && orders.length > 0) {
    const populatedOrders = await Order.find({
      _id: { $in: orders.map((row) => row._id) },
    })
      .select("_id items")
      .populate("items.menuItem")
      .populate("items.menuItemVariant")
      .lean();
    for (const order of populatedOrders) {
      standardFallbackById.set(
        String(order._id),
        round2(computeStandardCogsCostFromOrder(order))
      );
    }
  }
  const byDay = new Map();
  let total = 0;

  for (const row of orders) {
    const oid = row._id;
    let c = await sumCostAmountForOrder(oid);
    if (c <= 0) {
      c = await computeOrderCogsCost(row);
    }
    if (c <= 0 && String(defaultCostMethod).toLowerCase() === "standard") {
      c = standardFallbackById.get(String(oid)) || 0;
    }
    c = round2(c);
    if (c <= 0) continue;
    total = round2(total + c);
    const dayKey = ymdInTz(row.saleTs, tz);
    byDay.set(dayKey, round2((byDay.get(dayKey) || 0) + c));
  }

  return { total, byDay };
}

/**
 * @param {object} params
 * @param {import("mongoose").Types.ObjectId} params.organizationId
 * @param {import("mongoose").Types.ObjectId|null|undefined} params.locationScopeId
 * @param {Record<string, unknown>} [params.query]
 */
async function getDefaultDashboard(params) {
  const { organizationId, locationScopeId, query = {} } = params;
  if (!organizationId) {
    throw new Error("getDefaultDashboard: organizationId is required");
  }

  const { from, to, prevFrom, prevTo, tz, range, groupBy } =
    parseDashboardRange(query);

  const cfgLean = await AccountingConfig.findOne({
    organization: organizationId,
  })
    .select("defaultCostMethod companyCurrency")
    .lean();
  const displayCurrency = cfgLean?.companyCurrency || "USD";
  const defaultCostMethod = cfgLean?.defaultCostMethod || "fifo";

  const [
    salesNow,
    salesPrev,
    cogsNow,
    cogsPrev,
    visitorsNowMap,
    totalVisitorsNow,
    totalVisitorsPrev,
  ] = await Promise.all([
    getSalesReport(from, to, groupBy, tz, locationScopeId, organizationId),
    getSalesReport(
      prevFrom,
      prevTo,
      groupBy,
      tz,
      locationScopeId,
      organizationId
    ),
    computeCogsBucketed(
      organizationId,
      from,
      to,
      tz,
      locationScopeId,
      defaultCostMethod
    ),
    computeCogsBucketed(
      organizationId,
      prevFrom,
      prevTo,
      tz,
      locationScopeId,
      defaultCostMethod
    ),
    aggregateVisitorsByDay(
      organizationId,
      from,
      to,
      tz,
      locationScopeId
    ),
    countVisitorsTotal(organizationId, from, to, locationScopeId),
    countVisitorsTotal(
      organizationId,
      prevFrom,
      prevTo,
      locationScopeId
    ),
  ]);

  const revenueNow = salesNow.summary.totalRevenue;
  const revenuePrev = salesPrev.summary.totalRevenue;
  const costNow = cogsNow.total;
  const costPrev = cogsPrev.total;
  const profitNow = round2(revenueNow - costNow);
  const profitPrev = round2(revenuePrev - costPrev);

  const revMap = new Map(
    (salesNow.buckets || []).map((b) => [b.period, b.revenue])
  );
  const dayKeys = listDashboardDayKeys(from, to, tz);

  const chartData = dayKeys.map((date) => {
    const revenue = round2(revMap.get(date) || 0);
    const cost = round2(cogsNow.byDay.get(date) || 0);
    const visitors = visitorsNowMap.get(date) || 0;
    const profit = round2(revenue - cost);
    return { date, revenue, cost, profit, visitors };
  });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const todayOrderMatch = {
    organization: organizationId,
    status: "paid",
    createdAt: { $gte: todayStart, $lte: todayEnd },
  };
  if (locationScopeId) {
    todayOrderMatch.location = locationScopeId;
  }
  const [todayOrderRows, openTables] = await Promise.all([
    Order.find(todayOrderMatch).select("bills.totalWithTax").lean(),
    Table.countDocuments({
      organization: organizationId,
      ...(locationScopeId ? { location: locationScopeId } : {}),
      status: { $in: ["occupied", "billed"] },
    }),
  ]);
  const todayRevenue = round2(
    todayOrderRows.reduce(
      (sum, row) => sum + (Number(row?.bills?.totalWithTax) || 0),
      0
    )
  );
  const totalOrdersToday = todayOrderRows.length;
  const averageOrderValue = totalOrdersToday > 0 ? round2(todayRevenue / totalOrdersToday) : 0;

  return {
    range,
    tz,
    displayCurrency,
    summary: {
      totalRevenue: round2(revenueNow),
      totalCost: round2(costNow),
      totalProfit: round2(profitNow),
      totalVisitors: totalVisitorsNow,
      revenueChange: percentChange(revenueNow, revenuePrev),
      costChange: percentChange(costNow, costPrev),
      profitChange: percentChange(profitNow, profitPrev),
      visitorsChange: percentChange(totalVisitorsNow, totalVisitorsPrev),
    },
    todayKpis: {
      todayRevenue,
      totalOrders: totalOrdersToday,
      averageOrderValue,
      openTables,
    },
    chartData,
  };
}

module.exports = {
  getDefaultDashboard,
  async getRecentOrders({ organizationId, locationScopeId, limit }) {
    const normalizedLimit = Math.min(20, Math.max(1, Number(limit) || 5));
    const query = {
      organization: organizationId,
      status: { $in: ["paid", "closed"] },
    };
    if (locationScopeId) {
      query.location = locationScopeId;
    }
    const rows = await Order.find(query)
      .select("_id table waiter bills status createdAt")
      .populate("table", "_id tableNo")
      .populate("waiter", "name")
      .sort({ createdAt: -1 })
      .limit(normalizedLimit)
      .lean();
    return rows.map((row) => ({
      orderId: String(row._id),
      tableId:
        row.table && typeof row.table === "object" && row.table._id != null
          ? String(row.table._id)
          : "",
      tableNumber:
        row.table && typeof row.table === "object" && row.table.tableNo != null
          ? String(row.table.tableNo)
          : "",
      waiterName:
        row.waiter && typeof row.waiter === "object" && row.waiter.name
          ? String(row.waiter.name).trim()
          : "",
      totalAmount: Number(row.bills?.totalWithTax || 0),
      status: String(row.status || ""),
      createdAt: row.createdAt,
    }));
  },
  async getRecentVoids({ organizationId, locationScopeId, limit }) {
    const normalizedLimit = Math.min(20, Math.max(1, Number(limit) || 5));
    const query = {
      organization: organizationId,
      action: "void",
    };
    if (locationScopeId) {
      query.location = locationScopeId;
    }
    const rows = await PosAuditLog.find(query)
      .sort({ createdAt: -1 })
      .limit(normalizedLimit)
      .lean();
    return rows.map((row) => ({
      itemName: String(row.metadata?.itemName || "").trim() || "Unknown item",
      orderRef: String(row.metadata?.orderRef || "").trim(),
      tableNumber: String(row.metadata?.tableNumber || "").trim(),
      voidedBy: String(row.metadata?.voidedBy || "").trim(),
      reason: String(row.metadata?.reason || "").trim(),
      createdAt: row.createdAt,
    }));
  },
  async getDashboardLowStock({ organizationId, locationScopeId }) {
    const rows = await listLowStockIngredients(organizationId, locationScopeId);
    return rows.map((row) => ({
      ingredientId: String(row._id),
      ingredientName: String(row.name || "").trim(),
      currentStock: Number(row.currentStock) || 0,
      minStock: Number(row.reorderThreshold || 0),
      unit: String(row.unit || "").trim(),
    }));
  },
};
