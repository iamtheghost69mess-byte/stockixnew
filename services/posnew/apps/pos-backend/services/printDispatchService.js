const PrintJob = require("../models/printJobModel");
const { getIo } = require("./posSocketBus");

async function dispatchBluetoothPrintJob(printJobId) {
  if (String(process.env.PRINTER_MODE || "").toLowerCase() === "fake") {
    const job = await PrintJob.findById(printJobId).populate("printer");
    if (!job) {
      throw new Error("Print job not found.");
    }
    const cap = global.__FAKE_PRINTER_CAPTURE__;
    if (cap && typeof cap.onBluetoothPrint === "function") {
      await cap.onBluetoothPrint(job);
    }
    job.socketDelivered = true;
    job.status = "done";
    job.lastError = "";
    await job.save();
    return { delivered: true, fake: true };
  }

  const io = getIo();
  if (!io) {
    throw new Error("Socket server unavailable.");
  }

  const job = await PrintJob.findById(printJobId).populate("printer");
  if (!job) {
    throw new Error("Print job not found.");
  }

  const printerId = String(job.printer?._id || "");
  if (!printerId) {
    throw new Error("Print job printer is missing.");
  }

  const room = `printer:${printerId}`;
  const roomSize = io.of("/").adapter.rooms.get(room)?.size || 0;
  if (roomSize < 1) {
    job.status = "failed";
    job.lastError = "Terminal not connected";
    await job.save();
    return { delivered: false, reason: "terminal_not_connected" };
  }

  io.to(room).emit("print:job", {
    printJobId: String(job._id),
    ticketData: job.ticketData || {},
    printerType: "bluetooth",
  });
  job.socketDelivered = true;
  job.status = "pending";
  job.lastError = "";
  await job.save();
  return { delivered: true };
}

module.exports = {
  dispatchBluetoothPrintJob,
};
