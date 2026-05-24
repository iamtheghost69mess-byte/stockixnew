/**
 * One-time: create a default Organization and attach tenant-owned collections.
 * Safe to run multiple times (idempotent-ish).
 *
 * Usage: `npm run migrate:single-tenant-org`
 */
require("dotenv").config();
const mongoose = require("mongoose");
const config = require("../config/config");
const Organization = require("../models/organizationModel");
const User = require("../models/userModel");
const Location = require("../models/locationModel");
const Order = require("../models/orderModel");
const Category = require("../models/categoryModel");
const MenuItem = require("../models/menuItemModel");
const Customer = require("../models/customerModel");
const Table = require("../models/tableModel");
const Printer = require("../models/printerModel");
const Payment = require("../models/paymentModel");
const TaxConfig = require("../models/taxConfigModel");
const LoyaltyConfig = require("../models/loyaltyConfigModel");
const LoyaltyAccount = require("../models/loyaltyAccountModel");
const RbacConfig = require("../models/rbacConfigModel");
const PublicMenuBranding = require("../models/publicMenuBrandingModel");
const Ingredient = require("../models/ingredientModel");
const IngredientCategory = require("../models/ingredientCategoryModel");
const Supplier = require("../models/supplierModel");
const IngredientSupplier = require("../models/ingredientSupplierModel");
const Recipe = require("../models/recipeModel");
const PurchaseOrder = require("../models/purchaseOrderModel");
const StockMovement = require("../models/stockMovementModel");
const StockLot = require("../models/stockLotModel");
const StockBalance = require("../models/stockBalanceModel");
const StockTakeSession = require("../models/stockTakeSessionModel");
const OrderStockReservation = require("../models/orderStockReservationModel");
const IngredientPriceHistory = require("../models/ingredientPriceHistoryModel");
const DiscountAudit = require("../models/discountAuditModel");

const TENANT_MODELS = [
  User,
  Location,
  Order,
  Category,
  MenuItem,
  Customer,
  Table,
  Printer,
  Payment,
  TaxConfig,
  LoyaltyConfig,
  LoyaltyAccount,
  RbacConfig,
  PublicMenuBranding,
  Ingredient,
  IngredientCategory,
  Supplier,
  IngredientSupplier,
  Recipe,
  PurchaseOrder,
  StockMovement,
  StockLot,
  StockBalance,
  StockTakeSession,
  OrderStockReservation,
  IngredientPriceHistory,
  DiscountAudit,
];

async function main() {
  await mongoose.connect(config.databaseURI);
  const slug = process.env.DEFAULT_ORG_SLUG || "default-restaurant";
  let org = await Organization.findOne({ slug });
  if (!org) {
    org = await Organization.create({
      name: process.env.DEFAULT_ORG_NAME || "Default Restaurant",
      slug,
      lifecycle: "active",
      planKey: "standard",
    });
    console.log("created organization", org._id.toString());
  } else {
    console.log("using existing organization", org._id.toString());
  }

  const filter = {
    $or: [{ organization: null }, { organization: { $exists: false } }],
  };

  for (const Model of TENANT_MODELS) {
    const r = await Model.updateMany(filter, { $set: { organization: org._id } });
    console.log(`${Model.modelName} updated:`, r.modifiedCount);
  }

  const orphanTables = await Table.find({
    organization: org._id,
    location: { $ne: null },
  }).populate("location", "organization");
  for (const t of orphanTables) {
    const locOrg = t.location?.organization;
    if (locOrg && String(locOrg) !== String(org._id)) {
      console.warn(
        "table",
        t._id.toString(),
        "location org mismatch — manual review"
      );
    }
  }

  console.log(
    "Done. Rebuild Mongo indexes if duplicate-key errors occur after unique compound changes."
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
