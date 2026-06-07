"use client";

/** Notifications created before this page session are inbox history — never Sonner. */
const PAGE_LOADED_AT = Date.now();
const TOAST_SKEW_MS = 5000;

export type StreamNotification = {
  id: string;
  type: string;
  severity: "info" | "success" | "warning" | "error";
  title: string;
  body: string;
  tenantId?: string | null;
  actionUrl?: string | null;
  actionLabel?: string | null;
  readAt: string | null;
  createdAt: string;
  meta?: Record<string, unknown> | null;
};

export type NotificationStreamHandlers = {
  onPrime: (notification: StreamNotification) => void;
  onLive: (notification: StreamNotification) => void;
  onConnected: (unread: number | undefined) => void;
};

const handlers = new Set<NotificationStreamHandlers>();
let es: EventSource | null = null;
let subscriberCount = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let connectionGen = 0;
let streamReady = false;
/** Only toast notifications created at or after this instant (ms). */
let liveAfterMs = PAGE_LOADED_AT - TOAST_SKEW_MS;

function parseNotification(raw: string): StreamNotification | null {
  try {
    return JSON.parse(raw) as StreamNotification;
  } catch {
    return null;
  }
}

function isLiveToastCandidate(notification: StreamNotification): boolean {
  if (!streamReady) return false;
  const created = Date.parse(notification.createdAt);
  if (!Number.isFinite(created)) return false;
  return created >= liveAfterMs;
}

function dispatchPrime(notification: StreamNotification): void {
  for (const h of handlers) h.onPrime(notification);
}

function dispatchLive(notification: StreamNotification): void {
  for (const h of handlers) h.onLive(notification);
}

function dispatchConnected(unread: number | undefined): void {
  for (const h of handlers) h.onConnected(unread);
}

function handleIncoming(notification: StreamNotification): void {
  if (!isLiveToastCandidate(notification)) {
    dispatchPrime(notification);
    return;
  }
  dispatchLive(notification);
}

function teardown(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  es?.close();
  es = null;
  streamReady = false;
}

function connect(): void {
  if (typeof window === "undefined") return;

  if (es) {
    es.close();
    es = null;
  }

  const gen = ++connectionGen;
  streamReady = false;
  liveAfterMs = PAGE_LOADED_AT - TOAST_SKEW_MS;

  const instance = new EventSource("/api/notifications/stream");
  es = instance;

  instance.addEventListener("connected", (ev) => {
    if (gen !== connectionGen || es !== instance) return;
    try {
      const data = JSON.parse(String(ev.data)) as {
        unread?: number;
        liveAfter?: string;
      };
      if (typeof data.liveAfter === "string") {
        const t = Date.parse(data.liveAfter);
        if (Number.isFinite(t)) liveAfterMs = t;
      }
      streamReady = true;
      dispatchConnected(
        typeof data.unread === "number" ? data.unread : undefined,
      );
    } catch {
      streamReady = true;
      dispatchConnected(undefined);
    }
  });

  instance.addEventListener("prime", (ev) => {
    if (gen !== connectionGen || es !== instance) return;
    const notification = parseNotification(String(ev.data));
    if (notification) dispatchPrime(notification);
  });

  instance.addEventListener("notification", (ev) => {
    if (gen !== connectionGen || es !== instance) return;
    const notification = parseNotification(String(ev.data));
    if (notification) handleIncoming(notification);
  });

  instance.addEventListener("ping", () => {
    /* keep-alive */
  });

  instance.onerror = () => {
    if (gen !== connectionGen || es !== instance) return;
    instance.close();
    if (es === instance) es = null;
    streamReady = false;
    if (subscriberCount === 0) return;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (subscriberCount > 0) connect();
    }, 5000);
  };
}

export function subscribeOwnerNotificationStream(
  h: NotificationStreamHandlers,
): () => void {
  handlers.add(h);
  subscriberCount += 1;
  if (!es) connect();

  return () => {
    handlers.delete(h);
    subscriberCount = Math.max(0, subscriberCount - 1);
    if (subscriberCount === 0) teardown();
  };
}
