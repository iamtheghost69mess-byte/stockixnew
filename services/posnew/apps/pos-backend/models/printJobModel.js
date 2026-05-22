const mongoose = require("mongoose");

const printJobSchema = new mongoose.Schema(
  {
    org: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      default: null,
      index: true,
    },
    printer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Printer",
      required: true,
      index: true,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
      index: true,
    },
    printerType: {
      type: String,
      enum: ["network", "usb", "bluetooth", "epson-epos"],
      required: true,
      index: true,
    },
    ticketPayload: { type: String, default: "" },
    ticketData: { type: Object, default: {} },
    status: {
      type: String,
      enum: ["pending", "printing", "done", "failed"],
      default: "pending",
      index: true,
    },
    attempts: { type: Number, default: 0 },
    lastError: { type: String, default: "" },
    socketDelivered: { type: Boolean, default: false },
    queueJobId: { type: String, default: "", index: true },
  },
  { timestamps: true }
);

printJobSchema.index({ org: 1, printer: 1, status: 1, createdAt: -1 });
printJobSchema.index({ printer: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("PrintJob", printJobSchema);
