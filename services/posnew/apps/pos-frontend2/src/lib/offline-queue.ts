export type OfflineMutationKind =
  | "create_order"
  | "patch_order_items"
  | "pay_order"
  | "inventory_adjust";

export type OfflineMutation = {
  id: string;
  dedupeKey: string;
  kind: OfflineMutationKind;
  payload: Record<string, unknown>;
  attempts: number;
  createdAt: number;
  updatedAt: number;
};

export const OFFLINE_DB_NAME = "pos-offline-db";
export const OFFLINE_DB_VERSION = 3;
const DB_NAME = OFFLINE_DB_NAME;
const DB_VERSION = OFFLINE_DB_VERSION;
const STORE = "mutations";
export const STOCK_SNAPSHOT_STORE = "stock_snapshot";

function isBrowser() {
  return typeof window !== "undefined" && !!window.indexedDB;
}

function makeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `m_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/** Stable idempotency key for offline order creates (stored on Order.offlineSyncKey). */
export function makeOfflineSyncKey(): string {
  return makeId();
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isBrowser()) return reject(new Error("IndexedDB unavailable"));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
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

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => Promise<T> | T): Promise<T> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const out = await fn(store);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
      tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed"));
    });
    return out;
  } finally {
    db.close();
  }
}

function requestResult<T = unknown>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB request failed"));
  });
}

export async function enqueueOfflineMutation(
  kind: OfflineMutationKind,
  payload: Record<string, unknown>,
  dedupeKey: string,
) {
  const now = Date.now();
  await withStore("readwrite", async (store) => {
    const idx = store.index("dedupeKey");
    const cursorReq = idx.openCursor(IDBKeyRange.only(dedupeKey));
    const existing = await new Promise<OfflineMutation | null>((resolve, reject) => {
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        resolve(cursor ? (cursor.value as OfflineMutation) : null);
      };
      cursorReq.onerror = () => reject(cursorReq.error || new Error("Failed reading dedupe key"));
    });
    if (existing) {
      const updated: OfflineMutation = {
        ...existing,
        kind,
        payload,
        updatedAt: now,
      };
      await requestResult(store.put(updated));
      return;
    }
    const row: OfflineMutation = {
      id: makeId(),
      dedupeKey,
      kind,
      payload,
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    };
    await requestResult(store.put(row));
  });
}

export async function listOfflineMutations(limit = 100): Promise<OfflineMutation[]> {
  return withStore("readonly", async (store) => {
    const req = store.getAll();
    const rows = (await requestResult(req)) as OfflineMutation[];
    return rows.sort((a, b) => a.createdAt - b.createdAt).slice(0, limit);
  });
}

export async function countOfflineMutations(): Promise<number> {
  return withStore("readonly", async (store) => {
    const req = store.count();
    return Number(await requestResult(req)) || 0;
  });
}

export async function removeOfflineMutation(id: string) {
  await withStore("readwrite", async (store) => {
    await requestResult(store.delete(id));
  });
}

export async function markOfflineMutationAttempt(id: string) {
  await withStore("readwrite", async (store) => {
    const row = (await requestResult(store.get(id))) as OfflineMutation | undefined;
    if (!row) return;
    row.attempts = (row.attempts || 0) + 1;
    row.updatedAt = Date.now();
    await requestResult(store.put(row));
  });
}

export async function clearOfflineMutations() {
  await withStore("readwrite", async (store) => {
    await requestResult(store.clear());
  });
}
