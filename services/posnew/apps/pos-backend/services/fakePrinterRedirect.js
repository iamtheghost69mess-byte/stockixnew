/**
 * When PRINTER_MODE=fake, TCP print targets are redirected to localhost so
 * tools/fake-printers TCP simulators can capture real ESC/POS from orderPrinting.
 *
 * Port map: FAKE_PRINTER_PORTS JSON, e.g. {"Kitchen":9100,"Bar":9101}
 * Keys match printer document `name` (case-sensitive; trim applied).
 */

function isFakePrinterMode() {
  return String(process.env.PRINTER_MODE || "").toLowerCase() === "fake";
}

function parsePortMap() {
  const raw = process.env.FAKE_PRINTER_PORTS || "{}";
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object" && !Array.isArray(obj)) return obj;
  } catch {
    /* ignore */
  }
  return {};
}

/**
 * @param {{ name?: string, ipAddress?: string, port?: number }} printerDoc
 * @param {string} host resolved non-fake host
 * @param {number} port resolved non-fake port
 * @returns {{ host: string, port: number }}
 */
function applyFakeTcpIfNeeded(printerDoc, host, port) {
  if (!isFakePrinterMode()) {
    return { host, port };
  }
  const map = parsePortMap();
  const name = String(printerDoc?.name || "").trim();
  const mapped =
    map[name] ??
    map[name.toLowerCase()] ??
    Number(process.env.FAKE_PRINTER_DEFAULT_PORT || 9100);
  const p = Number(mapped);
  const fakePort = Number.isFinite(p) && p > 0 ? p : 9100;
  const fakeHost = String(process.env.FAKE_PRINTER_HOST || "127.0.0.1").trim() || "127.0.0.1";
  return { host: fakeHost, port: fakePort };
}

module.exports = {
  isFakePrinterMode,
  applyFakeTcpIfNeeded,
  parsePortMap,
};
