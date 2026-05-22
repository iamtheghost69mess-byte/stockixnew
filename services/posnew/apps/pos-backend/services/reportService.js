const Order = require("../models/orderModel");
const PosAuditLog = require("../models/posAuditLogModel");
const AccountingAccount = require("../models/accountingAccountModel");
const JournalEntry = require("../models/journalEntryModel");
const StockMovement = require("../models/stockMovementModel");
const Ingredient = require("../models/ingredientModel");
const Recipe = require("../models/recipeModel");
const { dateGroupFormat } = require("../utils/reportRange");
const { locationMatchForOrders } = require("../utils/tableScope");
const { dualPricesFromDoc } = require("../utils/menuItemPrices");

const PAID_MATCH = {
  $expr: { $eq: [{ $toLower: "$orderStatus" }, "paid"] },
};

function paidOrdersInRangePipeline(from, to, locationScopeId, organizationId) {
  const matchCond =
    organizationId != null
      ? { $and: [PAID_MATCH, { organization: organizationId }] }
      : PAID_MATCH;
  const pipe = [
    { $match: matchCond },
    {
      $addFields: {
        saleTs: { $ifNull: ["$paidAt", "$updatedAt"] },
      },
    },
    {
      $match: {
        saleTs: { $gte: from, $lte: to },
      },
    },
  ];
  const loc = locationMatchForOrders(locationScopeId);
  if (loc) pipe.push({ $match: loc });
  return pipe;
}

async function getSalesReport(
  from,
  to,
  groupBy,
  tz,
  locationScopeId,
  organizationId = null
) {
  const format = dateGroupFormat(groupBy);
  const pipeline = [
    ...paidOrdersInRangePipeline(
      from,
      to,
      locationScopeId,
      organizationId
    ),
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: "$bills.totalWithTax" },
              totalSubtotal: { $sum: "$bills.total" },
              totalTax: { $sum: "$bills.tax" },
              orderCount: { $sum: 1 },
            },
          },
        ],
        series: [
          {
            $group: {
              _id: {
                $dateToString: {
                  format,
                  date: "$saleTs",
                  timezone: tz,
                },
              },
              revenue: { $sum: "$bills.totalWithTax" },
              orderCount: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ],
      },
    },
  ];

  const [row] = await Order.aggregate(pipeline);
  const summary = row.summary[0] || {
    totalRevenue: 0,
    totalSubtotal: 0,
    totalTax: 0,
    orderCount: 0,
  };
  const orderCount = summary.orderCount || 0;
  const avgOrderValue =
    orderCount > 0 ? summary.totalRevenue / orderCount : 0;

  return {
    from,
    to,
    groupBy,
    timezone: tz,
    summary: {
      totalRevenue: round2(summary.totalRevenue),
      totalSubtotal: round2(summary.totalSubtotal),
      totalTax: round2(summary.totalTax),
      orderCount,
      averageOrderValue: round2(avgOrderValue),
    },
    buckets: (row.series || []).map((b) => ({
      period: b._id,
      revenue: round2(b.revenue),
      orderCount: b.orderCount,
    })),
  };
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function normalizePaymentMethod(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  if (!s) return "unknown";
  if (s === "cash") return "cash";
  if (
    ["card", "debit", "credit", "online", "razorpay", "upi"].includes(s)
  ) {
    if (s === "upi") return "mobile";
    return s === "online" || s === "razorpay" ? "card" : s;
  }
  if (["mobile", "wallet", "phonepe", "gpay"].includes(s)) return "mobile";
  if (raw === "Cash") return "cash";
  if (raw === "Online") return "card";
  return s;
}

async function getTopItemsReport(
  from,
  to,
  locationScopeId,
  organizationId = null
) {
  const pipeline = [
    ...paidOrdersInRangePipeline(
      from,
      to,
      locationScopeId,
      organizationId
    ),
    { $unwind: "$items" },
    {
      $match: {
        "items.menuItem": { $exists: true, $ne: null },
      },
    },
    {
      $addFields: {
        lineRevenue: {
          $let: {
            vars: {
              qty: { $ifNull: ["$items.quantity", 1] },
              ppu: { $ifNull: ["$items.pricePerQuantity", 0] },
              linePrice: { $ifNull: ["$items.price", 0] },
            },
            in: {
              $cond: [
                { $gt: ["$$linePrice", 0] },
                "$$linePrice",
                { $multiply: ["$$ppu", "$$qty"] },
              ],
            },
          },
        },
      },
    },
    {
      $group: {
        _id: "$items.menuItem",
        quantity: { $sum: "$items.quantity" },
        revenue: { $sum: "$lineRevenue" },
      },
    },
    { $sort: { quantity: -1 } },
    {
      $lookup: {
        from: "menuitems",
        localField: "_id",
        foreignField: "_id",
        as: "dish",
      },
    },
    { $unwind: { path: "$dish", preserveNullAndEmptyArrays: true } },
  ];

  const rows = await Order.aggregate(pipeline);
  const totalRev = rows.reduce((a, r) => a + (Number(r.revenue) || 0), 0);

  return {
    from,
    to,
    items: rows.map((r) => {
      const rev = round2(r.revenue);
      return {
        menuItemId: r._id,
        name: r.dish?.name || "Unknown item",
        quantity: r.quantity,
        revenue: rev,
        percentOfRevenue:
          totalRev > 0 ? round2((rev / totalRev) * 100) : 0,
      };
    }),
  };
}

async function getPaymentMethodsReport(
  from,
  to,
  locationScopeId,
  organizationId = null
) {
  const pipeline = [
    ...paidOrdersInRangePipeline(
      from,
      to,
      locationScopeId,
      organizationId
    ),
    {
      $group: {
        _id: "$paymentMethod",
        amount: { $sum: "$bills.totalWithTax" },
        orderCount: { $sum: 1 },
      },
    },
  ];
  const raw = await Order.aggregate(pipeline);
  const merged = new Map();
  for (const r of raw) {
    const bucket = normalizePaymentMethod(r._id);
    const cur = merged.get(bucket) || {
      method: bucket,
      amount: 0,
      orderCount: 0,
    };
    cur.amount += Number(r.amount) || 0;
    cur.orderCount += r.orderCount;
    merged.set(bucket, cur);
  }
  const breakdown = [...merged.values()].map((b) => ({
    ...b,
    amount: round2(b.amount),
  }));
  const total = breakdown.reduce((a, b) => a + b.amount, 0);
  return {
    from,
    to,
    breakdown: breakdown.map((b) => ({
      ...b,
      percentOfTotal: total > 0 ? round2((b.amount / total) * 100) : 0,
    })),
    total: round2(total),
  };
}

async function getFoodCostReport(from, to, organizationId = null) {
  const orgMatch =
    organizationId != null ? { organization: organizationId } : {};
  const consumedAgg = await StockMovement.aggregate([
    {
      $match: {
        reason: "order_deduction",
        createdAt: { $gte: from, $lte: to },
        ...orgMatch,
      },
    },
    {
      $group: {
        _id: "$ingredient",
        quantityConsumed: {
          $sum: { $multiply: [-1, "$delta"] },
        },
      },
    },
  ]);

  const receivedAgg = await StockMovement.aggregate([
    {
      $match: {
        reason: "receive",
        createdAt: { $gte: from, $lte: to },
        delta: { $gt: 0 },
        ...orgMatch,
      },
    },
    {
      $group: {
        _id: "$ingredient",
        received: { $sum: "$delta" },
      },
    },
  ]);
  const receivedById = new Map(
    receivedAgg.map((r) => [String(r._id), r.received])
  );

  const ingQ = organizationId ? { organization: organizationId } : {};
  const ingredients = await Ingredient.find(ingQ).sort({ name: 1 }).lean();
  const byId = new Map(ingredients.map((i) => [String(i._id), i]));
  const consumedById = new Map(
    consumedAgg.map((c) => [String(c._id), c.quantityConsumed])
  );

  const rows = ingredients.map((ing) => {
    const id = String(ing._id);
    const qtyConsumed = consumedById.get(id) || 0;
    const received = receivedById.get(id) || 0;
    const unitCost = Number(ing.unitCost) || 0;
    const consumedCost = round2(qtyConsumed * unitCost);
    const openingEstimate = round2(
      Number(ing.currentStock) + qtyConsumed - received
    );
    return {
      ingredientId: ing._id,
      name: ing.name,
      unit: ing.unit,
      unitCost,
      quantityConsumed: round2(qtyConsumed),
      consumedCostValue: consumedCost,
      receivedInPeriod: round2(received),
      openingStockEstimate: Math.max(0, openingEstimate),
      currentStock: ing.currentStock,
    };
  });

  const recQ = organizationId ? { organization: organizationId } : {};
  const recipes = await Recipe.find(recQ)
    .populate("menuItem", "name price currency priceUsd priceLbp")
    .lean();
  const dishCosts = [];
  for (const r of recipes) {
    const mi = r.menuItem;
    if (!mi || typeof mi !== "object") continue;
    let estCost = 0;
    for (const row of r.ingredients || []) {
      const ing = byId.get(String(row.ingredient));
      if (!ing) continue;
      const need = Number(row.quantity) || 0;
      estCost += need * (Number(ing.unitCost) || 0);
    }
    const { priceUsd, priceLbp } = dualPricesFromDoc(mi);
    const price = priceUsd > 0 ? priceUsd : priceLbp;
    dishCosts.push({
      menuItemId: mi._id,
      name: mi.name,
      price,
      estimatedIngredientCost: round2(estCost),
      foodCostPercent:
        price > 0 ? round2((estCost / price) * 100) : null,
    });
  }
  dishCosts.sort((a, b) => (b.foodCostPercent || 0) - (a.foodCostPercent || 0));

  return {
    from,
    to,
    ingredients: rows.filter((r) => r.quantityConsumed > 0 || r.unitCost > 0),
    dishes: dishCosts,
    note:
      "Opening stock is estimated from current stock + consumed in period − receives. Set ingredient unitCost for cost values.",
  };
}

async function getStaffReport(
  from,
  to,
  locationScopeId,
  organizationId = null
) {
  const pipeline = [
    ...paidOrdersInRangePipeline(
      from,
      to,
      locationScopeId,
      organizationId
    ),
    {
      $addFields: {
        lineQtySum: {
          $reduce: {
            input: { $ifNull: ["$items", []] },
            initialValue: 0,
            in: {
              $add: [
                "$$value",
                { $ifNull: ["$$this.quantity", 1] },
              ],
            },
          },
        },
        lineDiscountSum: {
          $reduce: {
            input: { $ifNull: ["$items", []] },
            initialValue: 0,
            in: {
              $add: [
                "$$value",
                { $ifNull: ["$$this.discount.amount", 0] },
              ],
            },
          },
        },
      },
    },
    {
      $addFields: {
        totalDiscountOnOrder: {
          $add: [
            { $ifNull: ["$manualDiscountAmount", 0] },
            { $ifNull: ["$loyaltyDiscountAmount", 0] },
            "$lineDiscountSum",
          ],
        },
      },
    },
    {
      $group: {
        _id: "$waiter",
        orderCount: { $sum: 1 },
        revenue: { $sum: "$bills.totalWithTax" },
        tips: { $sum: { $ifNull: ["$tipAmount", 0] } },
        totalItemsOrdered: { $sum: "$lineQtySum" },
        totalDiscountApplied: { $sum: "$totalDiscountOnOrder" },
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "u",
      },
    },
    { $unwind: { path: "$u", preserveNullAndEmptyArrays: true } },
    { $sort: { revenue: -1 } },
  ];

  const rows = await Order.aggregate(pipeline);
  return {
    from,
    to,
    staff: rows.map((r) => ({
      userId: r._id,
      name: r.u?.name || "Unassigned",
      username: r.u?.username || "",
      role: r.u?.role || "",
      orderCount: r.orderCount,
      revenue: round2(r.revenue),
      tips: round2(r.tips),
      totalItemsOrdered: Math.round(Number(r.totalItemsOrdered || 0)),
      totalDiscountApplied: round2(r.totalDiscountApplied),
      averageOrderValue:
        r.orderCount > 0 ? round2(r.revenue / r.orderCount) : 0,
    })),
  };
}

async function getTablesReport(
  from,
  to,
  locationScopeId,
  organizationId = null
) {
  const pipeline = [
    ...paidOrdersInRangePipeline(
      from,
      to,
      locationScopeId,
      organizationId
    ),
    {
      $addFields: {
        dwellMs: {
          $subtract: [
            "$saleTs",
            { $ifNull: ["$createdAt", "$orderDate"] },
          ],
        },
      },
    },
    {
      $group: {
        _id: "$table",
        covers: { $sum: 1 },
        revenue: { $sum: "$bills.totalWithTax" },
        avgDwellMs: { $avg: "$dwellMs" },
      },
    },
    {
      $lookup: {
        from: "tables",
        localField: "_id",
        foreignField: "_id",
        as: "tbl",
      },
    },
    { $unwind: { path: "$tbl", preserveNullAndEmptyArrays: true } },
    // Tables report should list only POS-floor tables (legacy rows without field are treated as visible).
    { $match: { "tbl.visibleInPos": { $ne: false } } },
    { $sort: { revenue: -1 } },
  ];

  const rows = await Order.aggregate(pipeline);
  return {
    from,
    to,
    tables: rows.map((r) => ({
      tableId: r._id,
      label: `Table ${r.tbl.tableNo}`,
      section: r.tbl?.section || "",
      covers: r.covers,
      revenue: round2(r.revenue),
      avgDwellMinutes: r.avgDwellMs
        ? round2(Number(r.avgDwellMs) / 60000)
        : null,
    })),
  };
}

async function getBranchComparisonReport(from, to, organizationId) {
  const pipeline = [
    ...paidOrdersInRangePipeline(from, to, null, organizationId),
    {
      $group: {
        _id: "$location",
        totalRevenue: { $sum: { $ifNull: ["$bills.totalWithTax", 0] } },
        totalTax: { $sum: { $ifNull: ["$bills.tax", 0] } },
        totalNetSales: { $sum: { $ifNull: ["$bills.total", 0] } },
        orderCount: { $sum: 1 },
      },
    },
    { $match: { _id: { $ne: null } } },
    {
      $lookup: {
        from: "locations",
        localField: "_id",
        foreignField: "_id",
        as: "locationDoc",
      },
    },
    { $unwind: { path: "$locationDoc", preserveNullAndEmptyArrays: true } },
    { $sort: { totalRevenue: -1, orderCount: -1 } },
  ];
  const rows = await Order.aggregate(pipeline);
  const branches = rows.map((row) => {
    const orderCount = Number(row.orderCount) || 0;
    const totalRevenue = round2(row.totalRevenue);
    return {
      locationId: row._id,
      locationName: row.locationDoc?.name || "Unknown location",
      locationCode: row.locationDoc?.code || "",
      orderCount,
      totalRevenue,
      totalTax: round2(row.totalTax),
      netSales: round2(row.totalNetSales),
      averageOrderValue: orderCount > 0 ? round2(totalRevenue / orderCount) : 0,
    };
  });
  const summary = branches.reduce(
    (acc, row) => ({
      totalRevenue: round2(acc.totalRevenue + row.totalRevenue),
      totalTax: round2(acc.totalTax + row.totalTax),
      totalNetSales: round2(acc.totalNetSales + row.netSales),
      totalOrders: acc.totalOrders + row.orderCount,
    }),
    { totalRevenue: 0, totalTax: 0, totalNetSales: 0, totalOrders: 0 }
  );
  return {
    from,
    to,
    summary: {
      ...summary,
      averageOrderValue:
        summary.totalOrders > 0
          ? round2(summary.totalRevenue / summary.totalOrders)
          : 0,
      branchCount: branches.length,
    },
    branches,
  };
}

async function getVoidsReport({
  from,
  to,
  organizationId,
  locationScopeId,
  userId,
}) {
  const query = {
    organization: organizationId,
    action: { $in: ["void", "item_voided_presend", "item_voided_postsend", "order_voided"] },
  };
  if (locationScopeId) query.location = locationScopeId;
  if (from || to) {
    query.createdAt = {};
    if (from) query.createdAt.$gte = from;
    if (to) query.createdAt.$lte = to;
  }
  if (userId) query.user = userId;
  const rows = await PosAuditLog.find(query)
    .select("action metadata createdAt")
    .sort({ createdAt: -1 })
    .lean();
  const voids = rows.map((row) => ({
    action: String(row.action || ""),
    itemName: String(row.metadata?.itemName || "").trim(),
    orderRef: String(row.metadata?.orderRef || "").trim(),
    tableNumber: String(row.metadata?.tableNumber || "").trim(),
    voidedBy: String(row.metadata?.voidedBy || "").trim(),
    reason: String(row.metadata?.reason || "").trim(),
    createdAt: row.createdAt,
  }));
  return {
    from,
    to,
    count: voids.length,
    items: voids,
  };
}

async function getSalesByCategoryReport(from, to, locationScopeId, organizationId = null) {
  const pipeline = [
    ...paidOrdersInRangePipeline(from, to, locationScopeId, organizationId),
    { $unwind: "$items" },
    {
      $lookup: {
        from: "menuitems",
        localField: "items.menuItem",
        foreignField: "_id",
        as: "menuItemDoc",
      },
    },
    { $unwind: { path: "$menuItemDoc", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "categories",
        localField: "menuItemDoc.category",
        foreignField: "_id",
        as: "categoryDoc",
      },
    },
    { $unwind: { path: "$categoryDoc", preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        lineRevenue: {
          $let: {
            vars: {
              qty: { $ifNull: ["$items.quantity", 1] },
              ppu: { $ifNull: ["$items.pricePerQuantity", 0] },
              linePrice: { $ifNull: ["$items.price", 0] },
            },
            in: {
              $cond: [
                { $gt: ["$$linePrice", 0] },
                "$$linePrice",
                { $multiply: ["$$ppu", "$$qty"] },
              ],
            },
          },
        },
      },
    },
    {
      $group: {
        _id: { $ifNull: ["$categoryDoc._id", null] },
        categoryName: { $first: { $ifNull: ["$categoryDoc.name", "Uncategorized"] } },
        itemCount: { $sum: { $ifNull: ["$items.quantity", 0] } },
        totalRevenue: { $sum: "$lineRevenue" },
      },
    },
    { $sort: { totalRevenue: -1 } },
  ];
  const rows = await Order.aggregate(pipeline);
  const totalRevenue = rows.reduce((sum, row) => sum + Number(row.totalRevenue || 0), 0);
  return {
    from,
    to,
    totalRevenue: round2(totalRevenue),
    categories: rows.map((row) => {
      const rev = round2(row.totalRevenue);
      return {
        categoryId: row._id,
        categoryName: row.categoryName,
        itemCount: Number(row.itemCount || 0),
        totalRevenue: rev,
        percentageOfTotal: totalRevenue > 0 ? round2((rev / totalRevenue) * 100) : 0,
      };
    }),
  };
}

async function getExpenseBreakdownReport({ from, to, organizationId, locationId }) {
  const expenseAccounts = await AccountingAccount.find({
    organization: organizationId,
    type: "expense",
    ...(locationId ? { $or: [{ location: locationId }, { location: null }, { location: { $exists: false } }] } : {}),
  })
    .select("_id code name")
    .lean();
  const accountIds = expenseAccounts.map((entry) => entry._id);
  if (accountIds.length === 0) {
    return { from, to, totalExpense: 0, groups: [] };
  }
  const match = {
    organization: organizationId,
    ...(locationId ? { location: locationId } : {}),
  };
  if (from || to) {
    match.entryDate = {};
    if (from) match.entryDate.$gte = from;
    if (to) match.entryDate.$lte = to;
  }
  const rows = await JournalEntry.aggregate([
    { $match: match },
    { $unwind: "$lines" },
    { $match: { "lines.account": { $in: accountIds } } },
    {
      $group: {
        _id: "$lines.account",
        debit: { $sum: { $ifNull: ["$lines.debit", 0] } },
        credit: { $sum: { $ifNull: ["$lines.credit", 0] } },
      },
    },
  ]);
  const accountById = new Map(expenseAccounts.map((entry) => [String(entry._id), entry]));
  const groups = rows
    .map((row) => {
      const amount = round2(Number(row.debit || 0) - Number(row.credit || 0));
      const acc = accountById.get(String(row._id));
      return {
        accountId: row._id,
        accountCode: acc?.code || "",
        accountName: acc?.name || "Expense",
        amount,
      };
    })
    .filter((entry) => entry.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const totalExpense = round2(groups.reduce((sum, group) => sum + group.amount, 0));
  return { from, to, totalExpense, groups };
}

module.exports = {
  paidOrdersInRangePipeline,
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
};
