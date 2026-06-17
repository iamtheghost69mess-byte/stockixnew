"use client";

import { useEffect, useState } from "react";

// Cache the result for the lifetime of the browser session — POS configuration
// does not change without a server restart, and the sidebar remounts on every
// navigation, so re-fetching each time wastes a connection for no benefit.
let _cachedVisible: boolean | null = null;
let _inFlight: Promise<boolean> | null = null;

async function fetchPosVisible(): Promise<boolean> {
  if (_inFlight) return _inFlight;
  _inFlight = fetch("/api/pos/status")
    .then(async (res) => {
      const data = (await res.json()) as { configured?: boolean; reachable?: boolean };
      _cachedVisible = Boolean(data.configured && data.reachable);
      return _cachedVisible;
    })
    .catch(() => {
      _cachedVisible = false;
      return false;
    })
    .finally(() => {
      _inFlight = null;
    });
  return _inFlight;
}

export function usePosNavVisible(): boolean {
  const [visible, setVisible] = useState(_cachedVisible ?? false);

  useEffect(() => {
    if (_cachedVisible !== null) return;
    void fetchPosVisible().then(setVisible);
  }, []);

  return visible;
}
