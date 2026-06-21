import { posApiJson } from "@/lib/pos-api-fetch";

export type PosPrinter = {
  _id: string;
  name: string;
  type: "network" | "usb" | "bluetooth" | "epson-epos";
  thermalDriver: "epson" | "star" | "tanca" | "daruma" | "brother" | "custom";
  ipAddress?: string;
  port?: number;
  eposUrl?: string;
  usbVendorId?: string;
  usbProductId?: string;
  bluetoothAddress?: string;
  location?: string | null;
  lastCheckedAt?: string;
};

/**
 * Heuristic until org/location has an explicit default receipt printer:
 * prefer a printer whose name matches "receipt", else first network or epson-epos, else first bluetooth/usb.
 */
export function pickDefaultThermalReceiptPrinterId(printers: readonly PosPrinter[]): string | null {
  const byName = printers.find((p) => /receipt/i.test(String(p.name || "")));
  if (byName) return byName._id;
  const net = printers.find((p) => p.type === "network" || p.type === "epson-epos");
  if (net) return net._id;
  const other = printers.find((p) => p.type === "bluetooth" || p.type === "usb");
  return other?._id ?? null;
}

export async function posFetchPrinters() {
  return posApiJson<PosPrinter[]>("/api/printers");
}

export async function posCreatePrinter(data: Partial<PosPrinter>) {
  return posApiJson<PosPrinter>("/api/printers", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function posUpdatePrinter(id: string, data: Partial<PosPrinter>) {
  return posApiJson<PosPrinter>(`/api/printers/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function posDeletePrinter(id: string) {
  return posApiJson<{ message: string }>(`/api/printers/${id}`, {
    method: "DELETE",
  });
}

export async function posTestPrint(id: string) {
  return posApiJson<{ message: string }>(`/api/printers/${id}/test`, {
    method: "POST",
  });
}

export async function posGetPrinterStatus(id: string) {
  return posApiJson<{ online: boolean; detail: string; lastCheckedAt: string }>(`/api/printers/${id}/status`);
}

export type PosPrinterDiscoveryItem = {
  printerId: string;
  name: string;
  type: "network" | "usb" | "bluetooth" | "epson-epos";
  online: boolean;
  detail: string;
  locationId?: string | null;
  locationName?: string;
  categoryCount?: number;
};

export async function posDiscoverPrinters(type: "all" | "network" | "usb" | "epson-epos" = "all") {
  return posApiJson<{
    scannedAt: string;
    total: number;
    online: number;
    offline: number;
    items: PosPrinterDiscoveryItem[];
  }>(`/api/printers/discover?type=${encodeURIComponent(type)}`);
}
