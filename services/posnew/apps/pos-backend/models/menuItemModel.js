const mongoose = require("mongoose");

const INVENTORY_IMPACT = ["stockable", "consumable", "service"];

const menuItemSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    /** Optional guest-facing note shown in public menu (separate from item description). */
    menuNote: { type: String, trim: true, default: "" },
    /** @deprecated Prefer priceUsd + priceLbp; kept for legacy data and readers. */
    price: { type: Number, required: true, min: 0 },
    /** @deprecated Prefer priceUsd + priceLbp */
    currency: { type: String, enum: ["USD", "LBP"], default: "USD" },
    /** Sell price in USD (number; may be 0 if LBP-only legacy). */
    priceUsd: { type: Number, min: 0, default: null },
    /** Sell price in Lebanese Lira (number; may be 0 if USD-only). */
    priceLbp: { type: Number, min: 0, default: null },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },
    imageUrl: { type: String, trim: true, default: "" },
    isAvailable: { type: Boolean, default: true },
    /** Active in catalog but hidden from POS when false. */
    showOnPOS: { type: Boolean, default: true, index: true },
    preparationTime: { type: Number, min: 0, default: 0 },
    /** Maps to AccountingConfig.taxRates[].code for line-level tax. */
    taxCode: { type: String, trim: true, default: "standard" },
    /** When true, `price` is tax-inclusive (gross). */
    priceTaxInclusive: { type: Boolean, default: false },
    /**
     * stockable — normal recipe deduction and costing.
     * consumable — deduct usage for reporting but do not reduce on-hand stock.
     * service — no inventory movements (marks line consumed without stock impact).
     */
    inventoryImpact: {
      type: String,
      enum: INVENTORY_IMPACT,
      default: "stockable",
      index: true,
    },
    /**
     * When set on a **stockable** item, deduct this ingredient qty = line quantity (sell unit = 1 stock unit)
     * instead of recipe BOM. Virtual “finished SKU” without a separate product master.
     */
    finishedGoodsIngredient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ingredient",
      default: null,
      index: true,
    },
    /** Standard cost per sellable unit (for defaultCostMethod standard) */
    standardUnitCost: { type: Number, default: null, min: 0 },
    /** When true, this item has child variants (MenuItemVariant) */
    hasVariants: { type: Boolean, default: false },
    /** Global SKU for the item (if no variants) */
    sku: { type: String, trim: true, default: "" },
    /** Searchable tags */
    tags: { type: [String], default: [] },
    modifierGroups: {
      type: [
        {
          groupId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ModifierGroup",
            required: true,
          },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

menuItemSchema.index({ organization: 1, category: 1, isAvailable: 1 });
menuItemSchema.index({ organization: 1, showOnPOS: 1, isAvailable: 1 });
menuItemSchema.index({ category: 1, isAvailable: 1 });
menuItemSchema.index({ organization: 1, sku: 1 }, { unique: true, sparse: true });
menuItemSchema.index({ tags: 1 });

/** API alias: checklist / integrations expect `isActive` alongside `isAvailable`. */
menuItemSchema.virtual("isActive").get(function getIsActive() {
  return this.isAvailable !== false;
});
menuItemSchema.virtual("isActive").set(function setIsActive(value) {
  this.set("isAvailable", Boolean(value));
});
menuItemSchema.set("toJSON", { virtuals: true });
menuItemSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("MenuItem", menuItemSchema);
module.exports.INVENTORY_IMPACT = INVENTORY_IMPACT;
