"use client";

import { useEffect, useRef } from "react";

import { flushOfflineMutationQueue } from "@/lib/pos-check-sync";

const SYNC_INTERVAL_MS = 15000;

export function PosSyncManager() {
  const syncingRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const runSync = async () => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      try {
        await flushOfflineMutationQueue();
      } finally {
        syncingRef.current = false;
      }
    };

    const onOnline = () => {
      void runSync();
    };

    window.addEventListener("online", onOnline);
    const intervalId = window.setInterval(() => {
      if (!navigator.onLine) return;
      void runSync();
    }, SYNC_INTERVAL_MS);

    if (navigator.onLine) {
      void runSync();
    }

    return () => {
      window.removeEventListener("online", onOnline);
      window.clearInterval(intervalId);
    };
  }, []);

  return null;
}
