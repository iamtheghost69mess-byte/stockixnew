const mongoose = require("mongoose");
const { toCanonical } = require("../utils/tableStatus");
const orgScopePlugin = require("../plugins/orgScopePlugin");

const tableSchema = new mongoose.Schema(
  {
    tableNo: { type: Number, required: true },
    section: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: ["available", "reserved", "occupied", "billed", "closed"],
      default: "available",
    },
    seats: {
      type: Number,
      required: true,
      min: 1,
    },
    /** Human-readable label for floor map / guest-facing copy (e.g. "VIP Booth 2"). */
    name: {
      type: String,
      trim: true,
      default: "",
    },
    pricePerPerson: {
      type: Number,
      default: 0,
      min: 0,
    },
    reservatorName: {
      type: String,
      trim: true,
      default: null,
    },
    reservatorPhone: {
      type: String,
      trim: true,
      default: null,
    },
    reservatorIsVip: {
      type: Boolean,
      default: false,
    },
    personsSeated: {
      type: Number,
      default: 0,
      min: 0,
    },
    currentOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
    },
    currentWaiter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    /** Set when an order is paid and the table is released (bill closed). Cleared when a new check opens. */
    lastBillPaidAt: {
      type: Date,
      default: null,
    },
    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      default: null,
      index: true,
    },
    /** Opaque token embedded in public guest QR links (`/self-order?table=<token>`). */
    publicQrToken: {
      type: String,
      trim: true,
      default: "",
    },
    /** Normalized 0–1 X/Y of table center on back-office floor plan (null = auto layout until dragged). */
    floorAnchorX: {
      type: Number,
      default: null,
      min: 0,
      max: 1,
    },
    floorAnchorY: {
      type: Number,
      default: null,
      min: 0,
      max: 1,
    },
    /**
     * When false, the table is kept for back-office / reservations but omitted from the POS floor list.
     * Omitted on legacy documents: treated as visible on POS.
     */
    visibleInPos: {
      type: Boolean,
    },
  },
  { timestamps: true }
);

tableSchema.plugin(orgScopePlugin);
tableSchema.index(
  { organization: 1, location: 1, tableNo: 1 },
  {
    unique: true,
    partialFilterExpression: { 
      organization: { $type: "objectId" },
      location: { $type: "objectId" } 
    },
  }
);
tableSchema.index(
  { tableNo: 1 },
  {
    unique: true,
    partialFilterExpression: {
      $or: [{ organization: null }, { organization: { $exists: false } }],
    },
  }
);
tableSchema.index({ organization: 1, location: 1 });
tableSchema.index(
  { publicQrToken: 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: { publicQrToken: { $type: "string", $ne: "" } },
  }
);

tableSchema.pre("save", function normalizeTableStatus(next) {
  this.status = toCanonical(this.status);
  next();
});

module.exports = mongoose.model("Table", tableSchema);
