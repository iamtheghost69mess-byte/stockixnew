const AccountingConfig = require("../models/accountingConfigModel");
const StockBalance = require("../models/stockBalanceModel");
const StockLot = require("../models/stockLotModel");
const { getConnection } = require("./jobQueue");
const {
  NOTIFICATION_EVENTS,
  createBackofficeNotificationFromEvent,
} = require("./backofficeNotificationEvents");
const ALERT_LOCK_KEY = "lock:inventory-alerts";
const ALERT_LOCK_TTL_MS = 3 * 60 * 1000;

async function collectLowStockRows(organizationId) {
  const match = organizationId ? { organization: organizationId } : {};
  const balances = await StockBalance.find(match)
    .populate("ingredient")
    .populate("location", "name code")
    .lean();
  const out = [];
  for (const b of balances) {
    const ing = b.ingredient;
    if (!ing || String(ing.status || "active") === "archived") continue;
    const q = Number(b.quantity) || 0;
    const r = Number(b.reservedQty) || 0;
    const avail = Math.max(0, q - r);
    const th = Number(ing.reorderThreshold) || 0;
    if (th <= 0 || avail > th) continue;
    out.push({
      kind: "low_stock",
      locationId: String(b.location?._id || b.location),
      locationName: b.location?.name || b.location?.code || "",
      ingredientId: String(ing._id),
      ingredientName: ing.name,
      availableQty: avail,
      reorderThreshold: th,
    });
  }
  return out;
}

async function collectExpiringLots(days, organizationId) {
  const d = Math.max(0, Number(days) || 0);
  if (!d) return [];
  const until = new Date();
  until.setDate(until.getDate() + d);
  until.setHours(23, 59, 59, 999);
  const now = new Date();
  const match = {
    quantity: { $gt: 0 },
    expiryDate: { $ne: null, $gte: now, $lte: until },
  };
  if (organizationId) {
    match.organization = organizationId;
  }
  const rows = await StockLot.find(match)
    .populate("ingredient", "name unit")
    .populate("location", "name code")
    .lean();
  return rows.map((lot) => ({
    kind: "expiring_lot",
    locationId: String(lot.location?._id || lot.location),
    locationName: lot.location?.name || lot.location?.code || "",
    ingredientId: String(lot.ingredient?._id || lot.ingredient),
    ingredientName: lot.ingredient?.name || "",
    lotNumber: lot.lotNumber || "",
    quantity: Number(lot.quantity) || 0,
    expiryDate: lot.expiryDate,
  }));
}

async function runInventoryAlertsOnce() {
  const cfgRows = await AccountingConfig.find({ inventoryAlertsEnabled: true })
    .select(
      "organization inventoryAlertsEnabled inventoryAlertWebhookUrl inventoryExpiryAlertDays"
    )
    .lean();
  if (!cfgRows.length) {
    return { skipped: true, reason: "disabled" };
  }

  const summary = {
    organizationsProcessed: 0,
    sent: 0,
    empty: 0,
    skippedNoWebhook: 0,
    skippedLegacyGlobal: 0,
  };

  for (const cfg of cfgRows) {
    if (!cfg.organization) {
      summary.skippedLegacyGlobal += 1;
      continue;
    }
    const url = String(cfg.inventoryAlertWebhookUrl || "").trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      summary.skippedNoWebhook += 1;
      continue;
    }

    const low = await collectLowStockRows(cfg.organization);
    const exp = await collectExpiringLots(
      cfg.inventoryExpiryAlertDays,
      cfg.organization
    );
    summary.organizationsProcessed += 1;
    if (!low.length && !exp.length) {
      summary.empty += 1;
      continue;
    }

    if (low.length > 0) {
      await createBackofficeNotificationFromEvent(
        NOTIFICATION_EVENTS.INVENTORY_LOW_STOCK,
        {
          organizationId: String(cfg.organization),
          lowStockCount: low.length,
          body: `${low.length} low-stock item(s) reached reorder threshold.`,
        },
      );
    }
    if (exp.length > 0) {
      await createBackofficeNotificationFromEvent(
        NOTIFICATION_EVENTS.INVENTORY_EXPIRING_STOCK,
        {
          organizationId: String(cfg.organization),
          expiringCount: exp.length,
          body: `${exp.length} lot(s) are near expiration.`,
        },
      );
    }

    const payload = {
      type: "inventory_alerts",
      at: new Date().toISOString(),
      organizationId: String(cfg.organization),
      lowStock: low,
      expiringLots: exp,
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Webhook ${res.status}: ${text.slice(0, 200)}`);
    }
    summary.sent += 1;
  }
  return summary;
}

async function acquireAlertLock() {
  const conn = getConnection();
  if (!conn || typeof conn.set !== "function") {
    return { acquired: true, token: null };
  }
  const token = `${process.pid}:${Date.now()}`;
  const result = await conn.set(
    ALERT_LOCK_KEY,
    token,
    "PX",
    ALERT_LOCK_TTL_MS,
    "NX"
  );
  return { acquired: result === "OK", token };
}

async function releaseAlertLock(token) {
  const conn = getConnection();
  if (!conn || !token) return;
  const script = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
      return redis.call("DEL", KEYS[1])
    end
    return 0
  `;
  await conn.eval(script, 1, ALERT_LOCK_KEY, token);
}

function startInventoryAlertScheduler() {
  const HOUR_MS = 60 * 60 * 1000;
  const tick = async () => {
    const lock = await acquireAlertLock();
    if (!lock.acquired) {
      return;
    }
    try {
      await runInventoryAlertsOnce();
    } catch (e) {
      console.error("[inventory-alerts]", e.message || e);
    } finally {
      await releaseAlertLock(lock.token);
    }
  };
  setTimeout(tick, 15_000);
  setInterval(tick, 4 * HOUR_MS);
}

module.exports = {
  runInventoryAlertsOnce,
  startInventoryAlertScheduler,
  collectLowStockRows,
  collectExpiringLots,
};
