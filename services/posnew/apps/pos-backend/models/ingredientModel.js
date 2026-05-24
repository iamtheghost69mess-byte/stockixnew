const mongoose = require("mongoose");
const orgScopePlugin = require("../plugins/orgScopePlugin");

const UNITS = ["g", "kg", "ml", "l", "piece"];
const INGREDIENT_STATUS = ["active", "archived"];

const ingredientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    /** Internal / barcode reference (optional). */
    sku: { type: String, trim: true, default: "" },
    description: { type: String, trim: true, default: "" },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "IngredientCategory",
      default: null,
      index: true,
    },
    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      required: true,
      index: true,
      alias: "locationId",
    },
    imageUrl: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: INGREDIENT_STATUS,
      default: "active",
      index: true,
    },
    unit: {
      type: String,
      required: true,
      enum: UNITS,
      default: "g",
    },
    /**
     * Unit used when purchasing (same enum). Conversion: 1 purchase unit =
     * `purchaseToStockFactor` stock units (e.g. purchase `kg`, stock `g`, factor 1000).
     */
    /** When set, purchasing is quoted in this unit; use purchaseToStockFactor into `unit`. */
    purchaseUnit: { type: String, enum: UNITS, default: undefined },
    /** How many `unit` (stock units) one `purchaseUnit` represents. Default 1. */
    purchaseToStockFactor: { type: Number, default: 1, min: 0.000001 },
    /**
     * Denormalized total on hand across all locations (kept in sync by stockBalanceService).
     */
    currentStock: { type: Number, required: true, default: 0, min: 0 },
    reorderThreshold: { type: Number, default: 0, min: 0 },
    reorderQuantity: { type: Number, default: 0, min: 0 },
    /** @deprecated Prefer IngredientSupplier + Supplier model; kept for imports / display. */
    supplier: { type: String, trim: true, default: "" },
    /** Cost per `unit` (stock unit); optional, for food-cost reports. */
    unitCost: { type: Number, default: 0, min: 0 },
    /** Weighted-average unit cost when cost method is weighted_average. */
    averageUnitCost: { type: Number, default: 0, min: 0 },
    /** Last recorded purchase unit cost (informational). */
    lastPurchaseUnitCost: { type: Number, default: 0, min: 0 },
    /** If true, every stock movement must specify serial numbers. */
    isSerialTracked: { type: Boolean, default: false },
    /** Regex or template for serial number validation if isSerialTracked is true. */
    serialNumberFormat: { type: String, trim: true, default: "" },
    /** Standard lead time in days for this ingredient from primary supplier. */
    leadTimeDays: { type: Number, default: 0, min: 0 },
    /** Buffer stock maintained to mitigate stockouts. */
    safetyStockLevel: { type: Number, default: 0, min: 0 },
    /** If true, system can automatically generate reorder suggestions. */
    isAutoReorder: { type: Boolean, default: false },
    /** If true, this item is never stocked and always fulfilled via dropship. */
    isDropshipOnly: { type: Boolean, default: false },
    /** Global or supplier barcode for the ingredient itself. */
    barcode: { type: String, trim: true, sparse: true },
    /** Minimum Order Quantity from primary suppliers */
    minimumOrderQuantity: { type: Number, default: 0, min: 0 },
    /** Ceiling for stock balances to prevent over-inventorying */
    maximumStockLevel: { type: Number, default: 0, min: 0 },
    /** Descriptive tags for filtering and categorization */
    tags: { type: [String], default: [], index: true },
    /** Standard shelf life in days from receipt (for automated expiry alerts) */
    shelfLifeDays: { type: Number, default: 0, min: 0 },
    /** Physical container/pack (e.g. Case, Bag, Liter, Box) */
    packagingType: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

ingredientSchema.plugin(orgScopePlugin);
ingredientSchema.index({ organization: 1, name: 1 });
ingredientSchema.index({ organization: 1, location: 1, name: 1 });
ingredientSchema.index({ organization: 1, location: 1, status: 1 });
ingredientSchema.index({ organization: 1, sku: 1 });
ingredientSchema.index({ organization: 1, category: 1, status: 1 });
ingredientSchema.index({ name: 1 });
ingredientSchema.index({ sku: 1 });
ingredientSchema.index({ currentStock: 1 });

ingredientSchema.set("toJSON", {
  virtuals: true,
  transform(_doc, ret) {
    if (ret.location != null && ret.locationId == null) {
      ret.locationId = ret.location;
    }
    return ret;
  },
});
ingredientSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Ingredient", ingredientSchema);
module.exports.UNITS = UNITS;
module.exports.INGREDIENT_STATUS = INGREDIENT_STATUS;
