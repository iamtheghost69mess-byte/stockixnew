"use client";

import { useEffect, useState } from "react";

type Me = {
  id: string;
  role: string;
  email: string;
  name: string;
  capabilities: {
    canAccessSettings: boolean;
    canManageOwners: boolean;
    canManageTenants: boolean;
    /** License extend / notes PATCH (billing_manager and above). */
    canExtendLicenses?: boolean;
  };
};

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
      const payload = (await r.json()) as { me?: Me };
      if (payload.me?.id && payload.me.role && payload.me.email && payload.me.name) {
        cachedMe = payload.me;
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
