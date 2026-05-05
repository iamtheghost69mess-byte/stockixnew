"use client";

import { useEffect, useState } from "react";

type Me = { id: string; role: string; email: string; name: string };

let cachedMe: Me | null = null;
let inFlight: Promise<Me | null> | null = null;

async function fetchMe(): Promise<Me | null> {
  if (inFlight) return inFlight;
  inFlight = fetch("/api/me")
    .then(async (r) => {
      if (!r.ok) {
        cachedMe = null;
        return null;
      }
      const data = (await r.json()) as Partial<Me>;
      if (data?.id && data?.role && data?.email && data?.name) {
        cachedMe = data as Me;
        return cachedMe;
      }
      cachedMe = null;
      return null;
    })
    .catch(() => {
      cachedMe = null;
      return null;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export function useMe(): Me | null {
  // Avoid stale module cache snapshots across logout/login transitions.
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    let mounted = true;
    void fetchMe().then((data) => {
      if (mounted) setMe(data);
    });
    return () => {
      mounted = false;
    };
  }, []);

  return me;
}
