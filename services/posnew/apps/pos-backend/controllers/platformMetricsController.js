const Organization = require("../models/organizationModel");
const ProductEvent = require("../models/productEventModel");
const ProductEventDailyRollup = require("../models/productEventDailyRollupModel");
const PlatformAuditLog = require("../models/platformAuditLogModel");
const User = require("../models/userModel");
const appConfig = require("../config/config");
const { errorBudgetRatio } = require("../services/observability");
const { parseOptionalMetricsRange, rangeDaysInclusive } = require("../utils/platformMetricsRange");


const summary = async (req, res, next) => {
  try {
    const day7 = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
    const [orgs, events24h, audits24h, rollupRows] = await Promise.all([
      Organization.countDocuments({}),
      ProductEvent.countDocuments({
        createdAt: { $gte: new Date(Date.now() - 86400_000) },
      }),
      PlatformAuditLog.countDocuments({
        createdAt: { $gte: new Date(Date.now() - 86400_000) },
      }),
      ProductEventDailyRollup.find({ dayUtc: { $gte: day7 } }).lean(),
    ]);
    let rollupEvents7d = 0;
    const rollupSeries7d = [];
    for (const row of rollupRows) {
      let dayTotal = 0;
      const c = row.countsByType;
      if (c && typeof c === "object") {
        for (const v of Object.values(c)) {
          const n = Number(v) || 0;
          dayTotal += n;
          rollupEvents7d += n;
        }
      }
      rollupSeries7d.push({ dayUtc: row.dayUtc, events: dayTotal });
    }
    rollupSeries7d.sort((a, b) => String(a.dayUtc).localeCompare(String(b.dayUtc)));
    res.json({
      success: true,
      data: {
        organizations: orgs,
        productEvents24h: events24h,
        productEventRollupRows7d: rollupRows.length,
        productEventRollupEvents7d: rollupEvents7d,
        productEventRollupSeries7d: rollupSeries7d,
        platformAudits24h: audits24h,
        slo: {
          availabilityTarget: appConfig.sloAvailabilityTarget,
          observedErrorBudgetRatio: errorBudgetRatio(),
        },
      },
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Owner KPIs: product-event leaders and control-plane activity.
 * Range: optional `from`+`to` (or `since`+`until`) overrides `windowDays` rolling window from "now".
 */
const kpis = async (req, res, next) => {
  try {
    const custom = parseOptionalMetricsRange(req.query);
    const windowDays = Math.min(
      365,
      Math.max(1, Number.parseInt(String(req.query.windowDays || "30"), 10) || 30)
    );
    const until = custom?.until ?? new Date();
    const since = custom?.since ?? new Date(Date.now() - windowDays * 86400000);
    const rangeDays = rangeDaysInclusive(since, until);

    const [
      topOrgsByEvents,
      productEventsInRange,
      platformAuditsInRange,
      platformUsersCount,
    ] = await Promise.all([
      ProductEvent.aggregate([
        { $match: { createdAt: { $gte: since, $lte: until } } },
        { $group: { _id: "$organization", eventCount: { $sum: 1 } } },
        { $sort: { eventCount: -1 } },
        { $limit: 25 },
        {
          $lookup: {
            from: "organizations",
            localField: "_id",
            foreignField: "_id",
            as: "org",
          },
        },
        { $unwind: { path: "$org", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            organizationId: "$_id",
            name: "$org.name",
            slug: "$org.slug",
            eventCount: 1,
          },
        },
      ]),
      ProductEvent.countDocuments({ createdAt: { $gte: since, $lte: until } }),
      PlatformAuditLog.countDocuments({ createdAt: { $gte: since, $lte: until } }),
      User.countDocuments({}),
    ]);

    res.json({
      success: true,
      data: {
        range: {
          since: since.toISOString(),
          until: until.toISOString(),
          rangeDays,
          source: custom ? "from_to" : "windowDays",
          windowDays: custom ? null : windowDays,
        },
        topOrganizationsByProductEvents: topOrgsByEvents,
        productEventsInRange,
        platformAuditsInRange,
        churnAndSeats: {
          staffUsersInActiveOrTrialingOrgs: Number(platformUsersCount) || 0,
        },
      },
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Daily product-event totals from rollup rows (cheap vs raw `ProductEvent` scans).
 * Query: `from` and `to` as `YYYY-MM-DD` UTC (inclusive).
 */
const analytics = async (req, res, next) => {
  try {
    const fromDay = String(req.query.from || "").trim();
    const toDay = String(req.query.to || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDay) || !/^\d{4}-\d{2}-\d{2}$/.test(toDay)) {
      return next(
        createHttpError(400, "from and to are required as YYYY-MM-DD (UTC calendar days).")
      );
    }
    if (fromDay > toDay) {
      return next(createHttpError(400, "from must be on or before to."));
    }
    const fromDate = new Date(`${fromDay}T00:00:00.000Z`);
    const toDate = new Date(`${toDay}T00:00:00.000Z`);
    if (toDate.getTime() - fromDate.getTime() > 366 * 86400000) {
      return next(createHttpError(400, "Range cannot exceed 366 days."));
    }

    const rows = await ProductEventDailyRollup.find({
      dayUtc: { $gte: fromDay, $lte: toDay },
    })
      .select("dayUtc countsByType organization")
      .lean();

    const byDay = new Map();
    let totalEvents = 0;
    for (const row of rows) {
      let dayTotal = 0;
      const c = row.countsByType;
      if (c && typeof c === "object") {
        for (const v of Object.values(c)) {
          const n = Number(v) || 0;
          dayTotal += n;
        }
      }
      totalEvents += dayTotal;
      const key = row.dayUtc;
      byDay.set(key, (byDay.get(key) || 0) + dayTotal);
    }

    const series = [...byDay.entries()]
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      .map(([dayUtc, events]) => ({ dayUtc, events }));

    res.json({
      success: true,
      data: {
        from: fromDay,
        to: toDay,
        series,
        totalRollupEvents: totalEvents,
        rollupRowCount: rows.length,
      },
    });
  } catch (e) {
    next(e);
  }
};

module.exports = {
  summary,
  kpis,
  analytics,
};
