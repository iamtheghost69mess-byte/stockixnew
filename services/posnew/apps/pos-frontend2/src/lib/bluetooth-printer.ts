import ReceiptPrinterEncoder from "@point-of-sale/receipt-printer-encoder";

export type TicketData = {
  items: Array<{ name: string; qty: number; note?: string }>;
  tableNumber: string;
  orderShortId: string;
  stationName: string;
  timestamp: string;
};

type ConnectedPrinter = {
  device: BluetoothDevice;
  characteristic: BluetoothRemoteGATTCharacteristic;
};

const ESC_POS_SERVICE = "000018f0-0000-1000-8000-00805f9b34fb";
const ESC_POS_CHAR = "00002af1-0000-1000-8000-00805f9b34fb";
const NORDIC_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const NORDIC_CHAR = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";

let connected: ConnectedPrinter | null = null;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isPrintingSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.bluetooth;
}

async function connectByProfile(serviceUuid: string, charUuid: string): Promise<ConnectedPrinter> {
  if (!navigator.bluetooth) {
    throw new Error("Web Bluetooth is unavailable in this browser.");
  }
  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: [serviceUuid],
  });

  if (!device.gatt) {
    throw new Error("Selected Bluetooth device does not expose a GATT server.");
  }
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(serviceUuid);
  const characteristic = await service.getCharacteristic(charUuid);
  return { device, characteristic };
}

async function connectKnownDeviceByProfile(
  device: BluetoothDevice,
  serviceUuid: string,
  charUuid: string,
): Promise<ConnectedPrinter> {
  if (!device.gatt) {
    throw new Error("Selected Bluetooth device does not expose a GATT server.");
  }
  const server = device.gatt.connected ? device.gatt : await device.gatt.connect();
  const service = await server.getPrimaryService(serviceUuid);
  const characteristic = await service.getCharacteristic(charUuid);
  return { device, characteristic };
}

export async function requestBluetoothPrinter(): Promise<ConnectedPrinter> {
  if (!isPrintingSupported()) {
    throw new Error("Web Bluetooth is not supported in this browser.");
  }
  try {
    connected = await connectByProfile(ESC_POS_SERVICE, ESC_POS_CHAR);
    return connected;
  } catch (escErr) {
    try {
      connected = await connectByProfile(NORDIC_SERVICE, NORDIC_CHAR);
      return connected;
    } catch (nordicErr) {
      throw new Error(
        `Unable to connect to a compatible Bluetooth printer. ESC/POS error: ${
          escErr instanceof Error ? escErr.message : String(escErr)
        }. Nordic UART error: ${nordicErr instanceof Error ? nordicErr.message : String(nordicErr)}.`,
      );
    }
  }
}

export function getBluetoothConnectionState(): {
  connected: boolean;
  deviceName: string;
} {
  return {
    connected: !!connected?.device?.gatt?.connected,
    deviceName: connected?.device?.name || "",
  };
}

export async function autoReconnectBluetoothPrinter(preferredName?: string): Promise<boolean> {
  if (!isPrintingSupported() || !navigator.bluetooth?.getDevices) return false;
  const knownDevices = await navigator.bluetooth.getDevices();
  if (!knownDevices.length) return false;
  const picked = knownDevices.find((d) => preferredName && d.name === preferredName) || knownDevices[0];
  try {
    connected = await connectKnownDeviceByProfile(picked, ESC_POS_SERVICE, ESC_POS_CHAR);
    return true;
  } catch {
    try {
      connected = await connectKnownDeviceByProfile(picked, NORDIC_SERVICE, NORDIC_CHAR);
      return true;
    } catch {
      return false;
    }
  }
}

function getStoredWidth() {
  if (typeof window === "undefined") return 32;
  const v = localStorage.getItem("printerWidth");
  return v === "80" ? 42 : 32;
}

async function writeBufferInChunks(characteristic: BluetoothRemoteGATTCharacteristic, bytes: Uint8Array) {
  const chunkSize = 512;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.slice(i, i + chunkSize);
    const writeWithoutResp = characteristic.writeValueWithoutResponse;
    if (typeof writeWithoutResp === "function") {
      await writeWithoutResp.call(characteristic, chunk);
    } else {
      await characteristic.writeValue(chunk);
    }
    await sleep(50);
  }
}

export async function sendTicketData(ticketData: TicketData): Promise<void> {
  if (!connected?.characteristic) {
    throw new Error("No Bluetooth printer connected. Pair a printer first.");
  }

  const width = getStoredWidth();
  const divider = "-".repeat(width);
  const encoder = new ReceiptPrinterEncoder({ columns: width });

  encoder
    .initialize()
    .align("center")
    .bold(true)
    .line(ticketData.stationName || "Station")
    .bold(false)
    .line(`Table: ${ticketData.tableNumber}`)
    .line(`Order: #${ticketData.orderShortId}`)
    .line(ticketData.timestamp)
    .line(divider)
    .align("left");

  for (const item of ticketData.items || []) {
    encoder.line(`${item.qty} x ${item.name}`);
    if (item.note) encoder.line(`   Note: ${item.note}`);
  }

  const bytes = encoder.align("center").line(divider).cut().encode();
  await writeBufferInChunks(connected.characteristic, bytes);
}

export function disconnectPrinter(): void {
  if (connected?.device?.gatt?.connected) {
    connected.device.gatt.disconnect();
  }
  connected = null;
}
