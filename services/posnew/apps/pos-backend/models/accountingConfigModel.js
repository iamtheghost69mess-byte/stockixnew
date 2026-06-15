const mongoose = require("mongoose");

const taxRateSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, trim: true },
    name: { type: String, default: "" },
    rate: { type: Number, default: 0 },
    kind: {
      type: String,
      enum: ["sales", "withholding"],
      default: "sales",
    },
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccountingAccount",
      required: true,
    },
  },
  { _id: false }
);

const paymentMapSchema = new mongoose.Schema(
  {
    /** Normalized: lowercase trimmed, e.g. "cash", "card" */
    methodKey: { type: String, required: true, trim: true, lowercase: true },
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccountingAccount",
      required: true,
    },
  },
  { _id: false }
);

const branchVatRateSchema = new mongoose.Schema(
  {
    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      required: true,
    },
    /** Percentage value (0..100) for the branch default VAT. */
    ratePercent: { type: Number, required: true, min: 0, max: 100 },
  },
  { _id: false }
);

const accountingConfigSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
    },
    /** Legacy discriminator; prefer `organization` for tenancy. */
    key: { type: String, default: "default" },
    /** Reporting / company currency (ISO 4217) */
    companyCurrency: { type: String, default: "USD", trim: true, uppercase: true },
    autoPostOnPaid: { type: Boolean, default: true },
    /** Post COGS + inventory relief when order is paid (recipes + unitCost) */
    autoPostCogsOnPaid: { type: Boolean, default: true },
    /** When true, skip native GL on paid orders; Bigcapital is source of truth. */
    bigcapitalIntegrationEnabled: { type: Boolean, default: false },
    defaultRevenueAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccountingAccount",
      default: null,
    },
    defaultTaxPayableAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccountingAccount",
      default: null,
    },
    defaultCashAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccountingAccount",
      default: null,
    },
    defaultCardClearingAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccountingAccount",
      default: null,
    },
    defaultDiscountAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccountingAccount",
      default: null,
    },
    /** Non-stock / service lines on vendor bills (not promotional discounts). */
    defaultPurchasesExpenseAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccountingAccount",
      default: null,
    },
    defaultAccountsReceivableAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccountingAccount",
      default: null,
    },
    defaultTipsPayableAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccountingAccount",
      default: null,
    },
    /** Liability account for collected service charges pending payout. */
    defaultServiceChargePayableAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccountingAccount",
      default: null,
    },
    /** Global service charge flag for POS checks. */
    serviceChargeEnabled: { type: Boolean, default: false },
    /** Percent value (0..100) applied to subtotal, excluded from tax base. */
    serviceChargeRate: { type: Number, default: 0, min: 0, max: 100 },
    /** Map tax line `code` on orders to liability accounts */
    taxRates: { type: [taxRateSchema], default: [] },
    paymentMethodAccounts: { type: [paymentMapSchema], default: [] },
    /** Optional per-branch VAT overrides keyed by location id. */
    branchVatRates: { type: [branchVatRateSchema], default: [] },
    /** fifo | fefo | lifo | weighted_average | standard — drives lot/cost consumption strategy */
    defaultCostMethod: {
      type: String,
      enum: ["fifo", "fefo", "lifo", "weighted_average", "standard"],
      default: "fifo",
    },
    /**
     * When POS consumes inventory for recipe lines (stored for audit/migration only).
     * Runtime behavior is **always payment** via `getInventorySettings` (paid orders only).
     */
    stockDeductTrigger: {
      type: String,
      enum: ["kitchen_send", "payment", "both"],
      default: "payment",
    },
    /**
     * Kitchen dispatch behavior:
     * - station_tickets: print by category/station on kitchen send.
     * - kitchen_display: no print required; move order to in-progress for KDS/panel flow.
     */
    kitchenFlowMode: {
      type: String,
      enum: ["station_tickets", "kitchen_display"],
      default: "station_tickets",
    },
    /** If true, manual discounts require a non-empty reason. */
    discountReasonRequired: { type: Boolean, default: true },
    /** If true, order APIs reject when recipe demand exceeds available stock (quantity − reserved). */
    strictOversell: { type: Boolean, default: false },
    /** When true, pending orders reserve recipe quantities against StockBalance.reservedQty. */
    reserveStockOnPending: { type: Boolean, default: true },
    retainedEarningsAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccountingAccount",
      default: null,
    },
    roundOffAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccountingAccount",
      default: null,
    },
    realizedFxGainAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccountingAccount",
      default: null,
    },
    realizedFxLossAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccountingAccount",
      default: null,
    },
    defaultGiftCardLiabilityAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccountingAccount",
      default: null,
    },
    defaultPurchasePriceVarianceAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccountingAccount",
      default: null,
    },
    defaultAccountsPayableAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccountingAccount",
      default: null,
    },
    defaultGrniAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccountingAccount",
      default: null,
    },
    /** Inventory asset (balance sheet) — used for stock take GL and similar. */
    defaultInventoryAssetAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccountingAccount",
      default: null,
    },
    /** P&L offset for net stock count variance at cost (gain or loss). */
    defaultStockTakeVarianceAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccountingAccount",
      default: null,
    },
    defaultCustomerDepositAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccountingAccount",
      default: null,
    },
    /** When set, low-stock and expiry summaries POST here as JSON (requires inventoryAlertsEnabled). */
    inventoryAlertWebhookUrl: { type: String, trim: true, default: "" },
    inventoryAlertsEnabled: { type: Boolean, default: false },
    /** Notify on lots expiring within this many days (0 disables expiry leg). */
    inventoryExpiryAlertDays: { type: Number, default: 7, min: 0, max: 365 },
    /** Generic automation callback fired after manual automation runs. */
    automationWebhookEnabled: { type: Boolean, default: false },
    automationWebhookUrl: { type: String, trim: true, default: "" },
    /** Setup wizard step 6: default branch used by POS register/session when opening a session. */
    defaultPosSourceLocation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      default: null,
    },
    /** Setup wizard step 6: order-level source location policy. */
    orderLocationBehavior: {
      type: String,
      enum: ["table_location", "session_location", "manual_scope"],
      default: "table_location",
    },
    sessionOpenCloseBehavior: { type: String, trim: true, default: "" },
    defaultReceiptPrinterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Printer",
      default: null,
    },
    /** Step 7 cashier visibility policy toggles. */
    cashierCanViewStockLevels: { type: Boolean, default: false },
    cashierCanViewCostData: { type: Boolean, default: false },
    /** When true, posting a vendor bill requires an approved `ApprovalRequest` for that bill id. */
    requireApprovalsForVendorPosting: { type: Boolean, default: false },
    /** When true, posting an expense report to GL requires an approved `ApprovalRequest` for that report id. */
    requireApprovalsForExpensePosting: { type: Boolean, default: false },
  },
  { timestamps: true }
);

accountingConfigSchema.index(
  { organization: 1 },
  {
    unique: true,
    partialFilterExpression: { organization: { $type: "objectId" } },
  }
);

module.exports = mongoose.model("AccountingConfig", accountingConfigSchema);
