"use client";

import { useEffect, useState } from "react";

export interface SearchTenantHit {
  id: string;
  slug: string;
  name: string;
  adminEmail: string;
  status: string | null;
}

export interface SearchLicenseHit {
  id: string;
  licenseKey: string;
  planSlug: string;
  status: string;
  tenantSlug: string | null;
}

export interface SearchOwnerHit {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface SearchResults {
  tenants: SearchTenantHit[];
  licenses: SearchLicenseHit[];
  owners: SearchOwnerHit[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function parseSearchResults(body: unknown): SearchResults | null {
  if (!isRecord(body)) return null;
  const tenantsRaw = body.tenants;
  const licensesRaw = body.licenses;
  const ownersRaw = body.owners;
  if (!Array.isArray(tenantsRaw) || !Array.isArray(licensesRaw) || !Array.isArray(ownersRaw)) {
    return null;
  }

  const tenants: SearchTenantHit[] = [];
  for (const row of tenantsRaw) {
    if (!isRecord(row)) continue;
    if (
      typeof row.id === "string"
      && typeof row.slug === "string"
      && typeof row.name === "string"
      && typeof row.adminEmail === "string"
    ) {
      tenants.push({
        id: row.id,
        slug: row.slug,
        name: row.name,
        adminEmail: row.adminEmail,
        status: typeof row.status === "string" ? row.status : null,
      });
    }
  }

  const licenses: SearchLicenseHit[] = [];
  for (const row of licensesRaw) {
    if (!isRecord(row)) continue;
    if (
      typeof row.id === "string"
      && typeof row.licenseKey === "string"
      && typeof row.planSlug === "string"
      && typeof row.status === "string"
    ) {
      licenses.push({
        id: row.id,
        licenseKey: row.licenseKey,
        planSlug: row.planSlug,
        status: row.status,
        tenantSlug: typeof row.tenantSlug === "string" ? row.tenantSlug : null,
      });
    }
  }

  const owners: SearchOwnerHit[] = [];
  for (const row of ownersRaw) {
    if (!isRecord(row)) continue;
    if (
      typeof row.id === "string"
      && typeof row.name === "string"
      && typeof row.email === "string"
      && typeof row.role === "string"
    ) {
      owners.push({
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role,
      });
    }
  }

  return { tenants, licenses, owners };
}

export function useGlobalSearch(query: string): {
  results: SearchResults | null;
  isLoading: boolean;
  error: string | null;
} {
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(id);
  }, [query]);

  useEffect(() => {
    if (debounced.length < 2) {
      setResults(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    const ac = new AbortController();
    setIsLoading(true);
    setError(null);

    void (async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(debounced)}`, {
          signal: ac.signal,
        });
        const data: unknown = await res.json().catch(() => ({}));
        if (!res.ok) {
          setResults(null);
          setError("Search failed.");
          return;
        }
        const parsed = parseSearchResults(data);
        setResults(parsed ?? { tenants: [], licenses: [], owners: [] });
      } catch (e: unknown) {
        if (e instanceof Error && e.name === "AbortError") return;
        setResults(null);
        setError("Search failed.");
      } finally {
        if (!ac.signal.aborted) setIsLoading(false);
      }
    })();

    return () => ac.abort();
  }, [debounced]);

  return { results, isLoading, error };
}
