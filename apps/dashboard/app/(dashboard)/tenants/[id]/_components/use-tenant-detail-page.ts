"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { useMe } from "@/hooks/use-me";
import { formatApiError } from "@/lib/api-errors";
import { tenantProfileSchema, type TenantProfileValues } from "@/lib/schemas";
import { tenantPublicBaseUrl } from "@/lib/tenant-url";
import type { ProvisionEventRow, TenantDetail } from "@/types/tenant";

import {
  MAX_PROVISION_POLL_MS,
  PROVISION_POLL_INTERVAL_MS,
  readJson,
} from "./tenant-detail-utils";

export function useTenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { me } = useMe();
  const isSuper = me?.role === "super_admin";

  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [events, setEvents] = useState<ProvisionEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stopProvisionOpen, setStopProvisionOpen] = useState(false);
  const [licenseReloadToken, setLicenseReloadToken] = useState(0);
  const [provisionPollTimedOut, setProvisionPollTimedOut] = useState(false);
  const provisionPollStartedAtRef = useRef<number | null>(null);

  const profileForm = useForm<TenantProfileValues>({
    resolver: zodResolver(tenantProfileSchema),
    defaultValues: {
      name: "",
      adminFirstName: "",
      adminLastName: "",
      adminEmail: "",
    },
  });

  const loadTenant = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tenants/${id}`);
      const body = await readJson(res);
      const data = body as { error?: string; tenant?: TenantDetail };
      if (!res.ok || !data.tenant) {
        throw new Error(formatApiError(body, data.error ?? `HTTP ${res.status}`));
      }
      setTenant(data.tenant);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    try {
      const res = await fetch(`/api/tenants/${id}/events`);
      const body = await readJson(res);
      const data = body as { events?: ProvisionEventRow[]; error?: string };
      if (!res.ok) {
        setError(formatApiError(body, data.error ?? `Failed to load events (HTTP ${res.status})`));
        setEvents([]);
        return;
      }
      setEvents(data.events ?? []);
    } catch (e) {
      setError(`Failed to load events: ${String(e)}`);
      setEvents([]);
    } finally {
      setEventsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadTenant();
    void loadEvents();
  }, [loadTenant, loadEvents]);

  useEffect(() => {
    if (!tenant) return;
    profileForm.reset({
      name: tenant.name,
      adminFirstName: tenant.adminFirstName,
      adminLastName: tenant.adminLastName,
      adminEmail: tenant.adminEmail,
    });
  }, [tenant, profileForm]);

  const deploymentStatus = (tenant?.deployment?.status ?? tenant?.status ?? "").toLowerCase();
  const tenantStatus = (tenant?.status ?? "").toLowerCase();
  const isProvisioning =
    deploymentStatus === "provisioning"
    || deploymentStatus === "pending"
    || deploymentStatus === "queued"
    || tenantStatus === "provisioning"
    || tenantStatus === "queued";
  const shouldPollProvisioning =
    (deploymentStatus === "provisioning"
      || deploymentStatus === "pending"
      || deploymentStatus === "queued"
      || tenantStatus === "provisioning"
      || tenantStatus === "queued")
    && !provisionPollTimedOut;

  useEffect(() => {
    if (!tenant || !shouldPollProvisioning) {
      provisionPollStartedAtRef.current = null;
      if (!shouldPollProvisioning) {
        setProvisionPollTimedOut(false);
      }
      return;
    }
    if (provisionPollStartedAtRef.current == null) {
      provisionPollStartedAtRef.current = Date.now();
    }

    const intervalId = window.setInterval(() => {
      const startedAt = provisionPollStartedAtRef.current ?? Date.now();
      if (Date.now() - startedAt >= MAX_PROVISION_POLL_MS) {
        setProvisionPollTimedOut(true);
        return;
      }
      void loadTenant();
      void loadEvents();
    }, PROVISION_POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [tenant, shouldPollProvisioning, loadTenant, loadEvents]);

  const baseUrl = useMemo(() => {
    if (!tenant) return null;
    return tenantPublicBaseUrl(tenant.slug, tenant.deployment?.internalPort ?? null);
  }, [tenant]);

  const posUrl = useMemo(() => {
    const stored = tenant?.deployment?.posUrl?.trim();
    return stored && stored.length > 0 ? stored : null;
  }, [tenant]);

  const canRevealPosPins = Boolean(
    me?.capabilities.canManageTenants && tenant?.posOrganizationId,
  );

  const posOrgHref = useMemo(() => {
    if (tenant?.posOrganizationId) {
      return `/pos/organizations/${tenant.posOrganizationId}`;
    }
    return "/pos/organizations";
  }, [tenant?.posOrganizationId]);

  const saveProfile = profileForm.handleSubmit(async (values) => {
    if (!tenant) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/tenants/${tenant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = await readJson(res);
      const data = body as { tenant?: TenantDetail; error?: string };
      if (!res.ok || !data.tenant) {
        throw new Error(formatApiError(body, data.error ?? `HTTP ${res.status}`));
      }
      setTenant(data.tenant);
      setEditing(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  });

  const handleModulesChanged = useCallback(async () => {
    await loadTenant();
    await loadEvents();
    setLicenseReloadToken((t) => t + 1);
  }, [loadTenant, loadEvents]);

  const resetProvisionPollStartedAt = useCallback(() => {
    provisionPollStartedAtRef.current = Date.now();
  }, []);

  const openStopProvision = useCallback(() => {
    setStopProvisionOpen(true);
  }, []);

  return {
    id,
    me,
    isSuper,
    tenant,
    events,
    loading,
    eventsLoading,
    error,
    setError,
    editing,
    setEditing,
    saving,
    profileForm,
    saveProfile,
    loadTenant,
    loadEvents,
    deploymentStatus,
    isProvisioning,
    shouldPollProvisioning,
    provisionPollTimedOut,
    setProvisionPollTimedOut,
    resetProvisionPollStartedAt,
    stopProvisionOpen,
    setStopProvisionOpen,
    openStopProvision,
    baseUrl,
    posUrl,
    canRevealPosPins,
    posOrgHref,
    handleModulesChanged,
    licenseReloadToken,
  };
}
