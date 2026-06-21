/**
 * Idempotent org backfill + diagnostics. Requires at least one Organization.
 * Anchor: DEFAULT_ORG_ID (valid ObjectId) or oldest org by _id.
 */
const mongoose = require("mongoose");

async function resolveAnchorOrgId() {
  const Organization = require("../models/organizationModel");
  const envId = process.env.DEFAULT_ORG_ID;
  if (envId && mongoose.Types.ObjectId.isValid(String(envId))) {
    const o = await Organization.findById(envId).select("_id").lean();
    if (o) return o._id;
  }
  const first = await Organization.findOne().sort({ _id: 1 }).select("_id").lean();
  if (!first) {
    throw new Error(
      "org-backfill: no Organization exists; create one before running migrations."
    );
  }
  return first._id;
}

const nullOrgFilter = {
  $or: [{ organization: null }, { organization: { $exists: false } }],
};

async function backfillOrgFromLocationField(Model, locationField = "location") {
  const Location = require("../models/locationModel");
  const hasLoc = { [locationField]: { $ne: null } };
  const filter = { $and: [nullOrgFilter, hasLoc] };
  const rows = await Model.find(filter).select(`_id ${locationField}`).lean();
  let updated = 0;
  for (const row of rows) {
    const locId = row[locationField];
    if (!locId) continue;
    const loc = await Location.findById(locId).select("organization").lean();
    if (loc?.organization) {
      await Model.updateOne(
        { _id: row._id },
        { $set: { organization: loc.organization } }
      );
      updated += 1;
    }
  }
  return updated;
}

const TENANT_MODELS_FOR_ANCHOR = [
  require("../models/userModel"),
  require("../models/locationModel"),
  require("../models/orderModel"),
  require("../models/categoryModel"),
  require("../models/menuItemModel"),
  require("../models/customerModel"),
  require("../models/tableModel"),
  require("../models/printerModel"),
  require("../models/paymentModel"),
  require("../models/taxConfigModel"),
  require("../models/loyaltyConfigModel"),
  require("../models/loyaltyAccountModel"),
  require("../models/rbacConfigModel"),
  require("../models/publicMenuBrandingModel"),
  require("../models/ingredientModel"),
  require("../models/ingredientCategoryModel"),
  require("../models/supplierModel"),
  require("../models/ingredientSupplierModel"),
  require("../models/recipeModel"),
  require("../models/purchaseOrderModel"),
  require("../models/stockMovementModel"),
  require("../models/stockLotModel"),
  require("../models/stockBalanceModel"),
  require("../models/stockTakeSessionModel"),
  require("../models/orderStockReservationModel"),
  require("../models/ingredientPriceHistoryModel"),
  require("../models/discountAuditModel"),
];

module.exports = [
  {
    migrationId: "2026-04-10-001-backfill-org-from-location",
    description:
      "Set organization from Location.organization for tenant rows still missing org (Table, Order, PO, stock balances, movements).",
    async run() {
      const Table = require("../models/tableModel");
      const Order = require("../models/orderModel");
      const PurchaseOrder = require("../models/purchaseOrderModel");
      const StockBalance = require("../models/stockBalanceModel");
      const StockMovement = require("../models/stockMovementModel");

      const summary = {
        Table: await backfillOrgFromLocationField(Table, "location"),
        Order: await backfillOrgFromLocationField(Order, "location"),
        PurchaseOrder: await backfillOrgFromLocationField(PurchaseOrder, "location"),
        StockBalance: await backfillOrgFromLocationField(StockBalance, "location"),
        StockMovement: await backfillOrgFromLocationField(StockMovement, "location"),
      };
      console.info("org-backfill from location:", summary);
    },
  },
  {
    migrationId: "2026-04-10-002-backfill-null-org-anchor",
    description:
      "Assign remaining null organization on tenant collections to anchor org (DEFAULT_ORG_ID or oldest Organization).",
    async run() {
      let anchor;
      try {
        anchor = await resolveAnchorOrgId();
      } catch (e) {
        console.warn(
          "defer 2026-04-10-002-backfill-null-org-anchor:",
          e.message || e
        );
        return { defer: true };
      }
      for (const Model of TENANT_MODELS_FOR_ANCHOR) {
        const r = await Model.updateMany(nullOrgFilter, {
          $set: { organization: anchor },
        });
        if (r.modifiedCount > 0) {
          console.info(
            `${Model.modelName}: set organization to anchor for ${r.modifiedCount} docs`
          );
        }
      }
    },
  },
  {
    migrationId: "2026-04-10-003-report-org-null-counts",
    description:
      "Log counts of documents still missing organization (diagnostic; non-fatal).",
    async run() {
      const counts = {};
      for (const Model of TENANT_MODELS_FOR_ANCHOR) {
        const n = await Model.countDocuments(nullOrgFilter);
        if (n > 0) counts[Model.modelName] = n;
      }
      console.info("org-null report (non-zero only):", counts);
    },
  },
  {
    migrationId: "2026-04-10-004-report-ingredient-category-org-mismatch",
    description:
      "Log count of ingredients whose category belongs to a different organization (read-only).",
    async run() {
      const Ingredient = require("../models/ingredientModel");
      const coll = Ingredient.collection.name;
      const agg = await Ingredient.aggregate([
        { $match: { category: { $ne: null } } },
        {
          $lookup: {
            from: "ingredientcategories",
            localField: "category",
            foreignField: "_id",
            as: "cat",
          },
        },
        { $unwind: "$cat" },
        {
          $match: {
            $expr: { $ne: ["$organization", "$cat.organization"] },
          },
        },
        { $count: "n" },
      ]);
      const n = agg[0]?.n ?? 0;
      console.info(`${coll}: ingredient vs ingredientCategory org mismatch count: ${n}`);
      if (
        process.env.MIGRATION_FIX_INGREDIENT_CATEGORY_ORPHANS === "1" &&
        n > 0
      ) {
        console.warn(
          "MIGRATION_FIX_INGREDIENT_CATEGORY_ORPHANS=1 set but automatic fix not implemented; repair manually."
        );
      }
    },
  },
];
