"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import { clearOfflineMutations, countOfflineMutations } from "@/lib/offline-queue";
import { flushOfflineMutationQueue } from "@/lib/pos-check-sync";
import { cn } from "@/lib/utils";

const REFRESH_MS = 4000;

export function OfflineStatusBanner() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refreshPending = useCallback(async () => {
    try {
      const n = await countOfflineMutations();
      setPending(n);
    } catch {
      // Ignore queue read errors in UI shell.
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setOnline(navigator.onLine);
    void refreshPending();

    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    const timer = window.setInterval(() => {
      void refreshPending();
    }, REFRESH_MS);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.clearInterval(timer);
    };
  }, [refreshPending]);

  const label = useMemo(() => {
    if (!online) {
      return pending > 0
        ? `Offline · ${pending} queued (orders, payments, adjustments)`
        : "Offline mode";
    }
    if (pending > 0) return `Online · ${pending} queued`;
    return "Online";
  }, [online, pending]);

  const runSyncNow = useCallback(async () => {
    if (!online) {
      toast.message("Still offline. Reconnect to sync queued orders.");
      return;
    }
    setSyncing(true);
    try {
      await flushOfflineMutationQueue();
      await refreshPending();
      toast.success("Sync completed.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }, [online, refreshPending]);

  const clearQueue = useCallback(async () => {
    await clearOfflineMutations();
    await refreshPending();
    toast.message("Offline queue cleared on this device.");
  }, [refreshPending]);

  return (
    <Card className={cn("py-0", online ? "border-zinc-800 bg-zinc-900/40" : "border-amber-900/50 bg-amber-950/25")}>
      <CardContent className="flex flex-wrap items-center gap-2 px-3 py-2">
        <span className={cn("text-xs", online ? "text-zinc-300" : "text-amber-200")}>{label}</span>
        {pending > 0 ? (
          <>
            <button
              type="button"
              className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-50"
              onClick={() => {
                void runSyncNow();
              }}
              disabled={syncing}
            >
              {syncing ? "Syncing..." : "Sync now"}
            </button>
            <button
              type="button"
              className="rounded-md border border-red-900/60 px-2 py-1 text-red-200 text-xs transition hover:bg-red-950/40"
              onClick={() => {
                void clearQueue();
              }}
            >
              Clear queued
            </button>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
