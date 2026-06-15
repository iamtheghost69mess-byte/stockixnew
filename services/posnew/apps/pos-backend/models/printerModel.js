const mongoose = require("mongoose");
const orgScopePlugin = require("../plugins/orgScopePlugin");

const PRINTER_TYPES = ["network", "usb", "bluetooth", "epson-epos"];
const THERMAL_DRIVERS = [
  "epson",
  "star",
  "tanca",
  "daruma",
  "brother",
  "custom",
];

const printerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: PRINTER_TYPES,
      default: "network",
    },
    /**
     * ESC/POS command variant for node-thermal-printer (Epson, Star, etc.).
     */
    thermalDriver: {
      type: String,
      enum: THERMAL_DRIVERS,
      default: "epson",
    },
    ipAddress: { type: String, trim: true, default: "" },
    port: { type: Number, default: 9100, min: 1, max: 65535 },
    /** Full URL for Epson ePOS HTTP device (POST raw ESC/POS body). */
    eposUrl: { type: String, trim: true, default: "" },
    /** USB vendor ID (hex string, e.g. 04b8). */
    usbVendorId: { type: String, trim: true, default: "" },
    /** USB product ID (hex string, e.g. 0e15). */
    usbProductId: { type: String, trim: true, default: "" },
    /** Bluetooth MAC address reference (pairing/routing metadata). */
    bluetoothAddress: { type: String, trim: true, default: "" },
    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      default: null,
      index: true,
    },
    /** Set when GET .../printers/:id/status is called. */
    lastCheckedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

printerSchema.plugin(orgScopePlugin);
printerSchema.index({ organization: 1, name: 1 });
printerSchema.index({ name: 1 });

module.exports = mongoose.model("Printer", printerSchema);
module.exports.PRINTER_TYPES = PRINTER_TYPES;
module.exports.THERMAL_DRIVERS = THERMAL_DRIVERS;
