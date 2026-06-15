const mongoose = require("mongoose");

const ITEM_STATUSES = ["pending", "sent", "ready", "served"];
const ORDER_SOURCES = ["staff", "self-order"];
const ORDER_STATUSES = [
  "pending",
  "in-progress",
  "ready",
  "served",
  "paid",
  "cancelled",
];
const ORDER_LIFECYCLE_STATUSES = ["draft", "sent", "billed", "paid", "closed"];

const orderItemSchema = new mongoose.Schema(
  {
    itemType: {
      type: String,
      enum: ["menu_item", "combo"],
      default: "menu_item",
    },
    comboId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Combo",
      default: null,
    },
    comboName: { type: String, trim: true, default: "" },
    comboPrice: { type: Number, default: null },
    selectedSlots: {
      type: [
        {
          slotName: { type: String, trim: true, required: true },
          menuItemId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "MenuItem",
            required: true,
          },
          menuItemName: { type: String, trim: true, required: true },
        },
      ],
      default: [],
    },
    selectedModifiers: {
      type: [
        {
          groupId: { type: mongoose.Schema.Types.ObjectId, ref: "ModifierGroup" },
          groupName: { type: String, trim: true, default: "" },
          selectedOptions: {
            type: [
              {
                name: { type: String, trim: true, required: true },
                priceAdjustment: { type: Number, default: 0 },
              },
            ],
            default: [],
          },
        },
      ],
      default: [],
    },
    menuItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuItem",
    },
    menuItemVariant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuItemVariant",
      default: null,
    },
    quantity: { type: Number, default: 1, min: 1 },
    note: { type: String, default: "" },
    status: {
      type: String,
      enum: ITEM_STATUSES,
      default: "pending",
    },
    name: { type: String },
    pricePerQuantity: { type: Number },
    price: { type: Number },
    /** Set when recipe-based stock was deducted for this line (idempotent). */
    stockDeductedAt: { type: Date, default: null },
    /** Override menu item tax code for this line (optional). */
    taxCode: { type: String, trim: true, default: null },
    /** Override inclusive pricing for this line (optional). */
    priceTaxInclusive: { type: Boolean, default: null },
    /** Optional manual discount applied directly to this line. */
    discount: {
      type: {
        type: String,
        enum: ["percentage", "fixed"],
        default: "fixed",
      },
      /** bill = check-level allocation stored on line for audit parity; item = line-only discount. */
      scope: {
        type: String,
        enum: ["bill", "item"],
        default: "item",
      },
      value: { type: Number, default: 0, min: 0 },
      amount: { type: Number, default: 0, min: 0 },
      appliedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      reason: { type: String, trim: true, default: "" },
      appliedAt: { type: Date, default: null },
    },
  },
  { _id: true }
);

const orderSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },
    customerDetails: {
      name: { type: String, default: "Walk-in" },
      phone: { type: String, default: "-" },
      guests: { type: Number, default: 1, min: 1 },
    },
    orderStatus: {
      type: String,
      required: true,
      default: "pending",
    },
    /**
     * Forward-only order lifecycle used by POS flow and reports.
     * draft -> sent -> billed -> paid -> closed
     */
    status: {
      type: String,
      enum: ORDER_LIFECYCLE_STATUSES,
      default: "draft",
      index: true,
    },
    orderDate: {
      type: Date,
      default: Date.now,
    },
    bills: {
      total: { type: Number, default: 0 },
      tax: { type: Number, default: 0 },
      serviceChargeRate: { type: Number, default: 0, min: 0 },
      serviceChargeAmount: { type: Number, default: 0, min: 0 },
      totalWithTax: { type: Number, default: 0 },
      /** Optional multi-bucket tax for GL: { code, label?, amount } — amounts should sum to tax */
      taxLines: {
        type: [
          {
            code: { type: String, required: true },
            label: { type: String, default: "" },
            amount: { type: Number, required: true, min: 0 },
          },
        ],
        default: undefined,
      },
    },
    /**
     * immediate: debit cash/card clearing when paid.
     * on_account: debit accounts receivable; settle via POST /accounting/ar/payments
     */
    billingMode: {
      type: String,
      enum: ["immediate", "on_account"],
      default: "immediate",
    },
    /** POS document currency (ISO 4217); amounts on order remain in this currency */
    documentCurrency: { type: String, default: null, trim: true, uppercase: true },
    /** Multiply line/document currency → company/reporting currency */
    fxRateToCompany: { type: Number, default: 1, min: 0 },
    items: [orderItemSchema],
    table: { type: mongoose.Schema.Types.ObjectId, ref: "Table" },
    waiter: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    waiterUsername: { type: String, trim: true, lowercase: true, default: "" },
    /** staff | self-order (QR guest) */
    orderSource: {
      type: String,
      enum: ORDER_SOURCES,
      default: "staff",
    },
    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      default: null,
      index: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
    },
    /**
     * Staff/manager manual discount (document currency), subtracted from check before pay.
     * Cumulative; capped to bills.totalWithTax when lines change.
     */
    manualDiscountAmount: { type: Number, default: 0, min: 0 },
    loyaltyPointsRedeemed: { type: Number, default: 0, min: 0 },
    loyaltyDiscountAmount: { type: Number, default: 0, min: 0 },
    /**
     * Multi-tender checkout: amounts must sum to `bills.totalWithTax` (document currency).
     * GL sale posting creates one debit per split via `paymentMethodAccounts` / defaults.
     */
    paymentSplits: {
      type: [
        {
          methodKey: { type: String, required: true, trim: true },
          amount: { type: Number, required: true, min: 0 },
        },
      ],
      default: undefined,
    },
    paymentMethod: String,
    paymentData: {
      razorpay_order_id: String,
      razorpay_payment_id: String,
    },
    /** Set when the order first becomes `paid` (for reporting). */
    paidAt: { type: Date, default: null, index: true },
    /** GL sale journal outcome after transition to paid (persisted for support / API). */
    accountingSaleStatus: {
      type: String,
      enum: ["ok", "failed", "skipped"],
      index: true,
    },
    accountingSaleError: { type: String, default: "", trim: true, maxlength: 500 },
    accountingSalePostedAt: { type: Date, default: null },
    /** COGS journal outcome for the same paid transition. */
    accountingCogsStatus: {
      type: String,
      enum: ["ok", "failed", "skipped"],
      index: true,
    },
    accountingCogsError: { type: String, default: "", trim: true, maxlength: 500 },
    accountingCogsPostedAt: { type: Date, default: null },
    /** True after monthly order entitlement usage was incremented for this order. */
    entitlementOrderUsageCounted: { type: Boolean, default: false },
    /** Client idempotency for offline sync replay */
    /** Omit when unset — do not default null (breaks sparse unique index). */
    offlineSyncKey: {
      type: String,
      sparse: true,
      unique: true,
      trim: true,
      index: true,
    },
    /** Filled when tipping is implemented (Phase 6); included in staff reports. */
    tipAmount: { type: Number, default: 0, min: 0 },
    /** Set when the order becomes paid (check closed at checkout). Legacy field;
     * floor edits are blocked by orderStatus paid/cancelled, not by kitchen submit.
     */
    linesLockedAt: { type: Date, default: null },
    /** True if this order contains items that were out of stock and are backordered */
    isBackorder: { type: Boolean, default: false },
    /** ERP fulfillment lifecycle */
    fulfillmentStatus: {
      type: String,
      enum: ["pending", "picking", "packed", "shipped", "delivered"],
      default: "pending",
      index: true,
    },
    /** Sales channel source */
    channel: {
      type: String,
      enum: ["pos", "web", "amazon", "shopify", "other"],
      default: "pos",
      index: true,
    },
    /** Supplier responsible for dropshipping this order (if applicable) */
    dropshipSupplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

orderSchema.index({ table: 1, orderStatus: 1 });
orderSchema.index({ orderStatus: 1, updatedAt: -1 });
orderSchema.index({ organization: 1, orderStatus: 1, updatedAt: -1 });
orderSchema.index({ organization: 1, location: 1, status: 1, updatedAt: -1 });

const Order = mongoose.model("Order", orderSchema);
Order.ITEM_STATUSES = ITEM_STATUSES;
Order.ORDER_STATUSES = ORDER_STATUSES;
Order.ORDER_LIFECYCLE_STATUSES = ORDER_LIFECYCLE_STATUSES;
Order.ORDER_SOURCES = ORDER_SOURCES;
module.exports = Order;
