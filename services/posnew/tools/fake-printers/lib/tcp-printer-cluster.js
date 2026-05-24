/**
 * In-process fake LAN printers: one TCP listener per logical printer.
 * Captures raw ESC/POS payloads for assertions and logs human-readable previews.
 */

const net = require("net");
const { escPosToReadable, formatPreviewBox, countQtyLines } = require("./escpos-utils");

/**
 * @typedef {{ name: string, port: number, host?: string }} FakePrinterDef
 */

/**
 * @param {readonly FakePrinterDef[]} printers
 */
function createTcpPrinterCluster(printers) {
  /** @type {Map<string, Array<{ name: string, jobNo: number, at: Date, buffer: Buffer, readable: string }>>} */
  const jobsByName = new Map();
  /** @type {Map<string, number>} */
  const counters = new Map();
  /** @type {import('net').Server[]} */
  const servers = [];

  for (const p of printers) {
    jobsByName.set(p.name, []);
    counters.set(p.name, 0);
  }

  /**
   * @param {string} name
   * @param {Buffer} payload
   */
  function recordJob(name, payload) {
    const list = jobsByName.get(name);
    if (!list) return;
    const jobNo = (counters.get(name) || 0) + 1;
    counters.set(name, jobNo);
    const readable = escPosToReadable(payload);
    const itemLines = countQtyLines(readable);
    const at = new Date();
    list.push({ name, jobNo, at, buffer: payload, readable });
    const ts = at.toTimeString().slice(0, 8);
    const summary = `[${name} Printer] Job #${jobNo} received at ${ts} — ${itemLines} item line(s)`;
    // eslint-disable-next-line no-console
    console.log(summary);
    // eslint-disable-next-line no-console
    console.log(
      formatPreviewBox(
        `${name} (job #${jobNo})`,
        readable.trim() || "(no printable text extracted)",
      ),
    );
  }

  for (const p of printers) {
    const host = p.host || "127.0.0.1";
    const srv = net.createServer((socket) => {
      const chunks = [];
      let idleTimer = null;
      let delivered = false;
      const flushOnce = () => {
        if (delivered) return;
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = null;
        const buf = Buffer.concat(chunks);
        chunks.length = 0;
        if (!buf.length) return;
        delivered = true;
        recordJob(p.name, buf);
      };
      socket.on("data", (d) => {
        chunks.push(Buffer.from(d));
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(flushOnce, 320);
      });
      socket.on("end", flushOnce);
      socket.on("close", () => {
        if (idleTimer) clearTimeout(idleTimer);
      });
      socket.on("error", () => {});
    });
    servers.push(srv);
    srv.listen(p.port, host);
  }

  function getJobs(printerName) {
    return [...(jobsByName.get(printerName) || [])];
  }

  function getAllJobs() {
    const out = {};
    for (const [k, v] of jobsByName) out[k] = [...v];
    return out;
  }

  function reset() {
    for (const k of jobsByName.keys()) {
      jobsByName.set(k, []);
      counters.set(k, 0);
    }
  }

  /**
   * @returns {Promise<void>}
   */
  function stop() {
    return new Promise((resolve) => {
      let left = servers.length;
      if (!left) return resolve();
      for (const s of servers) {
        s.close(() => {
          left -= 1;
          if (left <= 0) resolve();
        });
      }
    });
  }

  return {
    getJobs,
    getAllJobs,
    reset,
    stop,
    /** @internal */
    _jobsByName: jobsByName,
  };
}

/** Default LAN simulators (Drinks is Bluetooth in the scenario — not TCP). */
const DEFAULT_LAN_PRINTERS = [
  { name: "Kitchen", port: 9100 },
  { name: "Bar", port: 9101 },
  { name: "Grill", port: 9102 },
  { name: "Receipt", port: 9103 },
];

function defaultPortMapJson() {
  const o = {};
  for (const p of DEFAULT_LAN_PRINTERS) o[p.name] = p.port;
  return JSON.stringify(o);
}

module.exports = {
  createTcpPrinterCluster,
  DEFAULT_LAN_PRINTERS,
  defaultPortMapJson,
};
