"use client";

import { useCallback, useEffect, useState } from "react";

import { formatApiError } from "@/lib/api-errors";

const ORG_STATUSES = ["provisioning", "active", "suspended", "failed"] as const;

export type Organization = {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  subdomain: string;
  status: (typeof ORG_STATUSES)[number];
  provisioningError: string | null;
  createdAt: string;
  updatedAt: string;
  /** Local dev: full `http://{subdomain}:{nginxPort}` when nginx is published on a host port. */
  publicUrl: string | null;
};

function isOrgStatus(value: unknown): value is Organization["status"] {
  return typeof value === "string" && (ORG_STATUSES as readonly string[]).includes(value);
}

function parseOrganization(row: unknown): Organization | null {
  if (!row || typeof row !== "object") return null;
  const o = row as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.tenantId !== "string") return null;
  if (typeof o.name !== "string" || typeof o.slug !== "string" || typeof o.subdomain !== "string") {
    return null;
  }
  if (!isOrgStatus(o.status)) return null;
  if (typeof o.createdAt !== "string" || typeof o.updatedAt !== "string") return null;
  const provisioningError =
    o.provisioningError === null || typeof o.provisioningError === "string"
      ? (o.provisioningError as string | null)
      : null;
  const publicUrl =
    o.publicUrl === null || o.publicUrl === undefined
      ? null
      : typeof o.publicUrl === "string"
        ? o.publicUrl
        : null;
  return {
    id: o.id,
    tenantId: o.tenantId,
    name: o.name,
    slug: o.slug,
    subdomain: o.subdomain,
    status: o.status,
    provisioningError,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    publicUrl,
  };
}

type OrganizationsResponse = {
  organizations?: unknown[];
};

export function useOrganizations(tenantId: string) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(
    async (silent = false) => {
      if (!silent) {
        setIsLoading(true);
      }
      setError(null);
      try {
        const res = await fetch(`/api/tenants/${tenantId}/organizations`);
        const data = (await res.json()) as OrganizationsResponse;
        if (!res.ok) {
          const msg = formatApiError(
            data,
            typeof (data as { error?: unknown }).error === "string"
              ? (data as { error: string }).error
              : `HTTP ${res.status}`,
          );
          throw new Error(msg);
        }
        const list = Array.isArray(data.organizations) ? data.organizations : [];
        const parsed = list.map(parseOrganization).filter((x): x is Organization => x !== null);
        setOrganizations(parsed);
      } catch (e) {
        if (!silent) {
          setError(e instanceof Error ? e.message : String(e));
          setOrganizations([]);
        }
      } finally {
        if (!silent) {
          setIsLoading(false);
        }
      }
    },
    [tenantId],
  );

  useEffect(() => {
    void refetch(false);
  }, [refetch]);

  return { organizations, isLoading, error, refetch };
}
