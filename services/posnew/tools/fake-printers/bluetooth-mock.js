/**
 * In-memory mock of the Web Bluetooth API for Jest/jsdom, Node test runners, or Electron preload tests.
 * No native BLE — simulates GATT writeValue with optional latency and random failures.
 *
 * Usage:
 *   const { installWebBluetoothMock, uninstallWebBluetoothMock } = require('./bluetooth-mock');
 *   installWebBluetoothMock({ failRate: 0 });
 *   // ... run code that uses navigator.bluetooth ...
 *   uninstallWebBluetoothMock();
 */

const { escPosToReadable, formatPreviewBox } = require("./lib/escpos-utils");

/** @type {any} */
let savedNavigator = null;
/** @type {any} */
let previousBluetooth = undefined;
/** @type {any[]} */
const eventLog = [];

function logEvent(kind, detail) {
  const row = { t: new Date().toISOString(), kind, detail };
  eventLog.push(row);
  // eslint-disable-next-line no-console
  console.log(`[BT mock] ${kind}`, detail != null ? detail : "");
}

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {{ failRate?: number, connectDelayMinMs?: number, connectDelayMaxMs?: number, onWrite?: (buf: Buffer) => void }} opts
 */
function installWebBluetoothMock(opts = {}) {
  const failRate = Number.isFinite(opts.failRate) ? opts.failRate : 0.1;
  const dMin = opts.connectDelayMinMs ?? 300;
  const dMax = opts.connectDelayMaxMs ?? 800;

  const g = typeof globalThis !== "undefined" ? globalThis : global;
  if (!g.navigator) g.navigator = {};
  savedNavigator = g.navigator;
  previousBluetooth = g.navigator.bluetooth;

  /** @type {Buffer[]} */
  const writes = [];

  class FakeRemoteGattCharacteristic {
    /**
     * @param {string} uuid
     */
    constructor(uuid) {
      this.uuid = uuid;
    }

    /**
     * @param {BufferSource} value
     */
    async writeValue(value) {
      const buf = Buffer.isBuffer(value)
        ? value
        : Buffer.from(
            value.buffer,
            value.byteOffset ?? 0,
            value.byteLength ?? value.buffer?.byteLength ?? 0,
          );
      logEvent("writing", { uuid: this.uuid, bytes: buf.length });
      writes.push(buf);
      if (typeof opts.onWrite === "function") opts.onWrite(buf);
      const readable = escPosToReadable(buf);
      if (String(process.env.FAKE_BT_VERBOSE || "").toLowerCase() === "true") {
        // eslint-disable-next-line no-console
        console.log(
          formatPreviewBox("Bluetooth write (decoded)", readable.trim() || "(empty)"),
        );
      } else {
        const oneLine = readable.replace(/\s+/g, " ").trim().slice(0, 72);
        // eslint-disable-next-line no-console
        console.log(`[BT mock] decoded: ${oneLine || "(empty)"}`);
      }
      logEvent("done", { uuid: this.uuid });
    }
  }

  class FakeRemoteGattService {
    /**
     * @param {string} uuid
     */
    constructor(uuid) {
      this.uuid = uuid;
    }

    async getCharacteristic(uuid) {
      logEvent("getCharacteristic", uuid);
      return new FakeRemoteGattCharacteristic(uuid);
    }
  }

  class FakeRemoteGattServer {
    async connect() {
      logEvent("gatt.connect", "connected");
      return undefined;
    }

    async getPrimaryService(uuid) {
      logEvent("getPrimaryService", uuid);
      return new FakeRemoteGattService(uuid);
    }

    disconnect() {
      logEvent("disconnect", "");
    }
  }

  class FakeBluetoothDevice {
    constructor(name) {
      this.name = name;
      this.gatt = new FakeRemoteGattServer();
    }
  }

  g.navigator.bluetooth = {
    requestDevice: async (_options) => {
      logEvent("connecting", "");
      await delay(randInt(dMin, dMax));
      if (Math.random() < failRate) {
        const err = new Error("Bluetooth connection failed (simulated)");
        logEvent("error", err.message);
        throw err;
      }
      logEvent("connected", "");
      return new FakeBluetoothDevice("FakeThermal");
    },
  };

  return {
    getWrites: () => [...writes],
    clearWrites: () => {
      writes.length = 0;
    },
  };
}

function uninstallWebBluetoothMock() {
  const g = typeof globalThis !== "undefined" ? globalThis : global;
  if (savedNavigator) {
    savedNavigator.bluetooth = previousBluetooth;
  }
  previousBluetooth = undefined;
  savedNavigator = null;
  eventLog.length = 0;
}

function getBluetoothMockLog() {
  return [...eventLog];
}

function clearBluetoothMockLog() {
  eventLog.length = 0;
}

module.exports = {
  installWebBluetoothMock,
  uninstallWebBluetoothMock,
  getBluetoothMockLog,
  clearBluetoothMockLog,
};
