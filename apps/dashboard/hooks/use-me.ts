"use client";

import { useEffect, useState } from "react";

export type Me = {
  id: string;
  role: string;
  roleId?: string | null;
  roleName?: string | null;
  email: string;
  name: string;
  permissions?: string[];
  capabilities: {
    canAccessSettings: boolean;
    canManageOwners: boolean;
    canManageTenants: boolean;
    canExtendLicenses?: boolean;
    canManagePlans?: boolean;
    canReadPlans?: boolean;
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

export function useMe(): { me: Me | null; loading: boolean } {
  // Avoid stale module cache snapshots across logout/login transitions.
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    void fetchMe().then((data) => {
      if (mounted) {
        setMe(data);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  return { me, loading };
}
