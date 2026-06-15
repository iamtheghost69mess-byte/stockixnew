const mongoose = require("mongoose");
const Location = require("../models/locationModel");
const Ingredient = require("../models/ingredientModel");
const StockBalance = require("../models/stockBalanceModel");
const { recordInventoryAudit } = require("./inventoryAuditService");

let defaultLocationIdCache = null;

/**
 * @param {string|null|undefined} binId
 * @returns {string|null}
 */
function normalizeBinId(binId) {
  if (binId != null && mongoose.Types.ObjectId.isValid(String(binId))) {
    return String(binId);
  }
  return null;
}

async function getDefaultLocationId() {
  if (defaultLocationIdCache && mongoose.Types.ObjectId.isValid(defaultLocationIdCache)) {
    const still = await Location.exists({ _id: defaultLocationIdCache });
    if (still) return defaultLocationIdCache;
  }
  const first = await Location.findOne().sort({ createdAt: 1 }).select("_id").lean();
  defaultLocationIdCache = first?._id ? String(first._id) : null;
  return defaultLocationIdCache;
}

function resolveOrderLocationId(order) {
  const loc = order?.location;
  if (!loc) return null;
  if (typeof loc === "object" && loc._id) return String(loc._id);
  return String(loc);
}

/**
 * @param {string|null|undefined} locationId
 * @returns {Promise<string>}
 */
async function resolveLocationIdOrDefault(locationId) {
  if (locationId && mongoose.Types.ObjectId.isValid(String(locationId))) {
    const exists = await Location.exists({ _id: locationId });
    if (exists) return String(locationId);
  }
  const def = await getDefaultLocationId();
  if (!def) {
    throw new Error(
      "No Location documents exist. Create a location before using inventory."
    );
  }
  return def;
}

/**
 * Resolves a location for inventory ops, scoped to an organization when `organizationId` is set.
 */
async function resolveLocationIdOrDefaultForOrg(locationId, organizationId) {
  if (!organizationId) {
    return resolveLocationIdOrDefault(locationId);
  }
  const oid = organizationId;
  if (locationId && mongoose.Types.ObjectId.isValid(String(locationId))) {
    const loc = await Location.findOne({
      _id: locationId,
      organization: oid,
    })
      .select("_id")
      .lean();
    if (loc?._id) return String(loc._id);
  }
  const first = await Location.findOne({ organization: oid })
    .sort({ createdAt: 1 })
    .select("_id")
    .lean();
  if (!first?._id) {
    throw new Error(
      "No locations exist for this organization. Create a location first."
    );
  }
  return String(first._id);
}

/**
 * @param {string|null|undefined} session
 * @param {string|null|undefined} binId — storage bin (null = default / no bin row)
 */
async function getOrCreateBalance(locationId, ingredientId, session = null, binId = null) {
  const lid = String(locationId);
  const iid = String(ingredientId);
  const binKey = normalizeBinId(binId);
  const locQuery = Location.findById(lid).select("organization");
  if (session) locQuery.session(session);
  const loc = await locQuery.lean();
  const orgId = loc?.organization != null ? loc.organization : null;

  const balanceFilter =
    orgId != null
      ? { location: lid, ingredient: iid, organization: orgId, bin: binKey }
      : {
          location: lid,
          ingredient: iid,
          bin: binKey,
          $or: [{ organization: null }, { organization: { $exists: false } }],
        };

  const findQ = StockBalance.findOne(balanceFilter);
  if (session) findQ.session(session);
  let row = await findQ;
  if (!row) {
    const createOpts = session ? { session } : undefined;
    const created = await StockBalance.create(
      [
        {
          location: lid,
          ingredient: iid,
          organization: orgId || null,
          quantity: 0,
          reservedQty: 0,
          incomingQty: 0,
          maxStockLevel: 0,
          bin: binKey,
        },
      ],
      createOpts
    );
    row = created[0];
  }
  return row;
}

/**
 * @param {string|null|undefined} session
 */
async function syncIngredientTotalFromBalances(ingredientId, session = null) {
  const aggPipeline = StockBalance.aggregate([
    { $match: { ingredient: new mongoose.Types.ObjectId(String(ingredientId)) } },
    { $group: { _id: null, total: { $sum: "$quantity" } } },
  ]);
  if (session) aggPipeline.session(session);
  const agg = await aggPipeline;
  const total = agg.length ? Number(agg[0].total) || 0 : 0;
  await Ingredient.updateOne(
    { _id: ingredientId },
    { $set: { currentStock: Math.max(0, total) } },
    session ? { session } : {}
  );
  return Math.max(0, total);
}

/**
 * Apply a delta in **stock units** at a location. Updates balance row + ingredient.currentStock.
 * @param {string|null|undefined} binId — optional bin-specific balance row
 * @returns {{ balanceAfter: number, balanceRow: import('mongoose').Document }}
 */
async function applyQuantityDelta(locationId, ingredientId, delta, session = null, binId = null) {
  const lid = await resolveLocationIdOrDefault(locationId);
  const iid = String(ingredientId);
  const q = session
    ? { session }
    : {};
  const row = await getOrCreateBalance(lid, iid, session, binId);
  const prev = Number(row.quantity) || 0;
  const next = Math.max(0, prev + Number(delta));
  row.quantity = next;
  await row.save(q);
  const total = await syncIngredientTotalFromBalances(iid, session);
  const ing = await Ingredient.findById(iid).session(session || null);
  return { balanceAfter: next, totalStock: total, balanceRow: row, ingredient: ing };
}

/**
 * Bootstrap: copy ingredient.currentStock into default location if no balance rows exist.
 */
async function ensureBalancesFromLegacyTotals() {
  const def = await getDefaultLocationId();
  if (!def) return { migrated: 0, message: "No locations" };
  const ings = await Ingredient.find().select("_id currentStock").lean();
  let migrated = 0;
  for (const ing of ings) {
    const count = await StockBalance.countDocuments({ ingredient: ing._id });
    if (count > 0) continue;
    const qty = Math.max(0, Number(ing.currentStock) || 0);
    await StockBalance.create({
      location: def,
      ingredient: ing._id,
      quantity: qty,
    });
    migrated += 1;
  }
  return { migrated, defaultLocationId: def };
}

/**
 * Same as {@link ensureBalancesFromLegacyTotals} but only ingredients (and default location) for one org.
 */
async function ensureBalancesFromLegacyTotalsForOrg(organizationId) {
  const first = await Location.findOne({ organization: organizationId })
    .sort({ createdAt: 1 })
    .select("_id")
    .lean();
  if (!first?._id) {
    return { migrated: 0, message: "No locations for organization" };
  }
  const def = String(first._id);
  const ings = await Ingredient.find({ organization: organizationId })
    .select("_id currentStock")
    .lean();
  let migrated = 0;
  for (const ing of ings) {
    const count = await StockBalance.countDocuments({
      ingredient: ing._id,
      location: def,
    });
    if (count > 0) continue;
    const qty = Math.max(0, Number(ing.currentStock) || 0);
    await StockBalance.create({
      location: def,
      ingredient: ing._id,
      organization: organizationId,
      quantity: qty,
    });
    migrated += 1;
  }
  return { migrated, defaultLocationId: def };
}

/**
 * Inter-location transfer (same ingredient, stock units).
 */
async function transferQuantity({
  fromLocationId,
  toLocationId,
  ingredientId,
  quantity,
  userId,
  note,
  organizationId = null,
}) {
  const qty = Number(quantity);
  if (!qty || qty <= 0) throw new Error("quantity must be positive");
  if (organizationId && fromLocationId && mongoose.Types.ObjectId.isValid(String(fromLocationId))) {
    const fromCheck = await Location.exists({ _id: fromLocationId, organization: organizationId });
    if (!fromCheck) throw new Error("Source location not found or not in your organization.");
  }
  if (organizationId && toLocationId && mongoose.Types.ObjectId.isValid(String(toLocationId))) {
    const toCheck = await Location.exists({ _id: toLocationId, organization: organizationId });
    if (!toCheck) throw new Error("Destination location not found or not in your organization.");
  }
  const from = organizationId
    ? await resolveLocationIdOrDefaultForOrg(fromLocationId, organizationId)
    : await resolveLocationIdOrDefault(fromLocationId);
  const to = organizationId
    ? await resolveLocationIdOrDefaultForOrg(toLocationId, organizationId)
    : await resolveLocationIdOrDefault(toLocationId);
  if (String(from) === String(to)) {
    throw new Error("from and to locations must differ");
  }
  const fromLoc = await Location.findById(from).select("organization").lean();
  const toLoc = await Location.findById(to).select("organization").lean();
  if (!fromLoc || !toLoc) {
    throw new Error("Location not found.");
  }
  if (
    organizationId &&
    (String(fromLoc.organization || "") !== String(organizationId) ||
      String(toLoc.organization || "") !== String(organizationId))
  ) {
    throw new Error("Locations must belong to your organization.");
  }
  const orgForMove = fromLoc.organization || toLoc.organization || null;
  const iid = String(ingredientId);
  if (organizationId) {
    const ing = await Ingredient.findOne({
      _id: iid,
      organization: organizationId,
    })
      .select("_id")
      .lean();
    if (!ing) {
      throw new Error("Ingredient not found or not in your organization.");
    }
  }
  const StockMovement = require("../models/stockMovementModel");
  const { randomUUID } = require("crypto");
  const groupId = randomUUID();

  const session = await mongoose.startSession();
  try {
    let out = null;
    await session.withTransaction(async () => {
      const fromRow = await getOrCreateBalance(from, iid, session);
      const available = Number(fromRow.quantity) || 0;
      if (available < qty) {
        throw new Error(
          `Insufficient stock at source location (have ${available}, need ${qty})`
        );
      }

      fromRow.quantity = available - qty;
      await fromRow.save({ session });

      const toRow = await getOrCreateBalance(to, iid, session);
      toRow.quantity = (Number(toRow.quantity) || 0) + qty;
      await toRow.save({ session });

      const total = await syncIngredientTotalFromBalances(iid, session);

      await StockMovement.create(
        [
          {
            ingredient: iid,
            organization: orgForMove,
            delta: -qty,
            balanceAfter: fromRow.quantity,
            reason: "transfer_out",
            note: note || "",
            user: userId || null,
            location: from,
            counterLocation: to,
            transferGroupId: groupId,
          },
          {
            ingredient: iid,
            organization: orgForMove,
            delta: qty,
            balanceAfter: toRow.quantity,
            reason: "transfer_in",
            note: note || "",
            user: userId || null,
            location: to,
            counterLocation: from,
            transferGroupId: groupId,
          },
        ],
        { session, ordered: true }
      );

      if (orgForMove && mongoose.Types.ObjectId.isValid(String(orgForMove))) {
        await recordInventoryAudit({
          organizationId: orgForMove,
          action: "inventory.transfer",
          sourceType: "location_transfer",
          sourceId: null,
          actorId: userId,
          metadata: {
            fromLocationId: String(from),
            toLocationId: String(to),
            ingredientId: String(iid),
            quantity: qty,
            transferGroupId: groupId,
          },
          session,
        });
      }

      out = {
        transferGroupId: groupId,
        totalStock: total,
        fromBalance: fromRow.quantity,
        toBalance: toRow.quantity,
      };
    });
    return out;
  } finally {
    await session.endSession();
  }
}

/**
 * Set absolute quantity at default location (e.g. new ingredient with initial stock).
 */
async function setOpeningBalanceAtDefault(ingredientId, quantity) {
  const def = await getDefaultLocationId();
  if (!def) return;
  const row = await getOrCreateBalance(def, ingredientId);
  row.quantity = Math.max(0, Number(quantity) || 0);
  await row.save();
  await syncIngredientTotalFromBalances(ingredientId);
}

/**
 * Delta reserved quantity (soft hold). Result is clamped at 0.
 */
async function applyReservedDelta(locationId, ingredientId, delta, session = null) {
  const lid = await resolveLocationIdOrDefault(locationId);
  const iid = String(ingredientId);
  const row = await getOrCreateBalance(lid, iid, session);
  const next = Math.max(0, (Number(row.reservedQty) || 0) + Number(delta));
  row.reservedQty = next;
  const q = session ? { session } : {};
  await row.save(q);
  return row;
}

/**
 * Delta expected inbound (PO confirmed, not yet fully received). Clamped at 0.
 */
async function applyIncomingDelta(locationId, ingredientId, delta, session = null) {
  const lid = await resolveLocationIdOrDefault(locationId);
  const iid = String(ingredientId);
  const row = await getOrCreateBalance(lid, iid, session);
  const next = Math.max(0, (Number(row.incomingQty) || 0) + Number(delta));
  row.incomingQty = next;
  const q = session ? { session } : {};
  await row.save(q);
  return row;
}

module.exports = {
  getDefaultLocationId,
  resolveOrderLocationId,
  resolveLocationIdOrDefault,
  resolveLocationIdOrDefaultForOrg,
  getOrCreateBalance,
  syncIngredientTotalFromBalances,
  applyQuantityDelta,
  ensureBalancesFromLegacyTotals,
  ensureBalancesFromLegacyTotalsForOrg,
  transferQuantity,
  setOpeningBalanceAtDefault,
  applyReservedDelta,
  applyIncomingDelta,
};
