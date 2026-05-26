import type { MenuAvailabilityRow } from "@/lib/inventory-api";
import { fetchInventoryMenuAvailability } from "@/lib/inventory-api";
import {
  OFFLINE_DB_NAME,
  OFFLINE_DB_VERSION,
  STOCK_SNAPSHOT_STORE,
} from "@/lib/offline-queue";

export type StockSnapshot = {
  locationId: string;
  fetchedAt: number;
  strictOversell: boolean;
  menuAvailability: MenuAvailabilityRow[];
};

function isBrowser() {
  return typeof window !== "undefined" && !!window.indexedDB;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isBrowser()) return reject(new Error("IndexedDB unavailable"));
    const req = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("mutations")) {
        const store = db.createObjectStore("mutations", { keyPath: "id" });
        store.createIndex("dedupeKey", "dedupeKey", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(STOCK_SNAPSHOT_STORE)) {
        db.createObjectStore(STOCK_SNAPSHOT_STORE, { keyPath: "locationId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
  });
}

function requestResult<T = unknown>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB request failed"));
  });
}

export function resolvePosLocationId(posUser: unknown): string {
  if (!posUser || typeof posUser !== "object") return "";
  const loc = (posUser as { location?: unknown }).location;
  if (typeof loc === "string") return loc;
  if (loc && typeof loc === "object" && "_id" in loc) {
    return String((loc as { _id: string })._id);
  }
  return "";
}

export function stockSnapshotKey(locationId: string): string {
  return locationId.trim() || "__default__";
}

export async function writeStockSnapshot(snapshot: StockSnapshot): Promise<void> {
  if (!isBrowser()) return;
  const db = await openDb();
  try {
    const tx = db.transaction(STOCK_SNAPSHOT_STORE, "readwrite");
    const store = tx.objectStore(STOCK_SNAPSHOT_STORE);
    await requestResult(
      store.put({
        ...snapshot,
        locationId: stockSnapshotKey(snapshot.locationId),
      }),
    );
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("stock snapshot write failed"));
    });
  } finally {
    db.close();
  }
}

export async function readStockSnapshot(locationId: string): Promise<StockSnapshot | null> {
  if (!isBrowser()) return null;
  const db = await openDb();
  try {
    const tx = db.transaction(STOCK_SNAPSHOT_STORE, "readonly");
    const store = tx.objectStore(STOCK_SNAPSHOT_STORE);
    const row = (await requestResult(store.get(stockSnapshotKey(locationId)))) as StockSnapshot | undefined;
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("stock snapshot read failed"));
    });
    return row ?? null;
  } finally {
    db.close();
  }
}

export async function clearStockSnapshot(locationId?: string): Promise<void> {
  if (!isBrowser()) return;
  const db = await openDb();
  try {
    const tx = db.transaction(STOCK_SNAPSHOT_STORE, "readwrite");
    const store = tx.objectStore(STOCK_SNAPSHOT_STORE);
    if (locationId) {
      await requestResult(store.delete(stockSnapshotKey(locationId)));
    } else {
      await requestResult(store.clear());
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("stock snapshot clear failed"));
    });
  } finally {
    db.close();
  }
}

export async function refreshStockSnapshotFromApi(opts?: {
  locationId?: string;
  strictOversell?: boolean;
}): Promise<StockSnapshot | null> {
  if (!isBrowser() || !navigator.onLine) return null;
  const locationId = opts?.locationId ?? "";
  const res = await fetchInventoryMenuAvailability(
    locationId ? { locationId } : undefined,
  );
  const items = Array.isArray(res.data?.items) ? res.data!.items! : [];
  const snapshot: StockSnapshot = {
    locationId: res.data?.locationId
      ? String(res.data.locationId)
      : stockSnapshotKey(locationId),
    fetchedAt: Date.now(),
    strictOversell: opts?.strictOversell ?? false,
    menuAvailability: items.map((row) => ({ ...row })),
  };
  await writeStockSnapshot(snapshot);
  return snapshot;
}

/** Clone menu availability rows for in-memory offline ledger adjustments. */
export function cloneMenuAvailabilityRows(rows: MenuAvailabilityRow[]): MenuAvailabilityRow[] {
  return rows.map((row) => ({ ...row }));
}

export function isStockSyncConflictError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /insufficient stock|out of stock|cannot sell|fulfill|expired lot stock/i.test(msg);
}
