"use client";

import { useContext, useEffect, useState } from "react";
import { capabilitiesFromPermissions, permissionsForRoleSlug } from "@repo/shared/permissions";

import { MeContext } from "@/components/me-provider";

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

export function resetMeCache(): void {
  cachedMe = null;
  inFlight = null;
}

function normalizeMe(raw: Me): Me {
  const permissions =
    raw.permissions && raw.permissions.length > 0
      ? raw.permissions
      : [...permissionsForRoleSlug(raw.role)];
  return {
    ...raw,
    permissions,
    capabilities: capabilitiesFromPermissions(permissions),
  };
}

function isValidMe(raw: Me | undefined): raw is Me {
  return Boolean(raw?.id && raw.role && raw.email && raw.name);
}

async function fetchMe(): Promise<Me | null> {
  if (inFlight) return inFlight;
  inFlight = fetch("/api/me", { credentials: "same-origin" })
    .then(async (r) => {
      if (!r.ok) {
        cachedMe = null;
        return null;
      }
      const payload = (await r.json()) as { me?: Me };
      if (!isValidMe(payload.me)) {
        cachedMe = null;
        return null;
      }
      cachedMe = normalizeMe(payload.me);
      return cachedMe;
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
  const initialFromServer = useContext(MeContext);
  const seeded = initialFromServer !== undefined ? initialFromServer : cachedMe;
  const [me, setMe] = useState<Me | null>(
    seeded ? normalizeMe(seeded) : null,
  );
  const [loading, setLoading] = useState(seeded == null);

  useEffect(() => {
    // Server layout already validated this session and provided initialMe —
    // populate the module cache so subsequent client navigations benefit,
    // then skip the redundant round-trip.
    if (initialFromServer !== undefined) {
      if (initialFromServer) cachedMe = normalizeMe(initialFromServer);
      setLoading(false);
      return;
    }

    let mounted = true;
    void fetchMe().then((data) => {
      if (!mounted) return;
      if (data) {
        setMe(data);
      } else if (seeded) {
        setMe(normalizeMe(seeded));
      } else {
        setMe(null);
      }
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch once on mount; seed is initial snapshot only
  }, []);

  return { me, loading };
}
