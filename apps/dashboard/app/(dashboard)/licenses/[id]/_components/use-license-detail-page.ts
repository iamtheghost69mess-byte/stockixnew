"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { toast } from "@/components/reusabletoast";
import { useMe } from "@/hooks/use-me";
import { formatApiError } from "@/lib/api-errors";
import type {
  LicenseActivation,
  LicenseDetail,
  LicenseRow,
} from "@/types/license";

import type { LicenseHistoryEntry } from "./license-detail-utils";

export function useLicenseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const isSuper = me?.role === "super_admin";
  const canExtendOrEditNotes = Boolean(me?.capabilities.canExtendLicenses);
  const canSupportLicenseOps = me?.role === "support_agent" || me?.role === "super_admin";

  const [data, setData] = useState<LicenseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revokeReason, setRevokeReason] = useState("");
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");
  const [reactivateOpen, setReactivateOpen] = useState(false);
  const [deactivateAct, setDeactivateAct] = useState<LicenseActivation | null>(null);
  const [blacklistAct, setBlacklistAct] = useState<LicenseActivation | null>(null);
  const [blacklistReason, setBlacklistReason] = useState("");
  const [notesEdit, setNotesEdit] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [extendOpen, setExtendOpen] = useState(false);
  const [extendInitial, setExtendInitial] = useState<{
    isPerpetual: boolean;
    expiresAt: string | null;
  }>({ isPerpetual: false, expiresAt: null });
  const [activeTab, setActiveTab] = useState("overview");
  const [history, setHistory] = useState<LicenseHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const load = useCallback((): Promise<void> => {
    return (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/licenses/${id}`);
        const jsonUnknown = await res.json().catch(() => ({}));
        const json = jsonUnknown as {
          license?: LicenseDetail;
          error?: string;
        };
        if (res.status === 404) {
          setError("not_found");
          setData(null);
          return;
        }
        if (!res.ok || !json.license) {
          setError(formatApiError(jsonUnknown, json.error ?? `HTTP ${res.status}`));
          setData(null);
          return;
        }
        setData(json.license);
        setNotesDraft(json.license.notes ?? "");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (activeTab !== "history" || !id) return;
    void (async () => {
      setHistoryLoading(true);
      try {
        const res = await fetch(`/api/licenses/${id}/history?pageSize=100`);
        const json = (await res.json().catch(() => ({}))) as {
          history?: LicenseHistoryEntry[];
        };
        if (res.ok && Array.isArray(json.history)) {
          setHistory(json.history);
        } else {
          setHistory([]);
        }
      } catch {
        setHistory([]);
      } finally {
        setHistoryLoading(false);
      }
    })();
  }, [activeTab, id]);

  const saveNotes = async () => {
    if (!data || !canExtendOrEditNotes) return;
    setNotesSaving(true);
    try {
      const res = await fetch(`/api/licenses/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notesDraft }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as unknown;
        toast.error(formatApiError(body, "Failed to save notes"));
        return;
      }
      toast.success("Notes saved");
      setNotesEdit(false);
      void load();
    } finally {
      setNotesSaving(false);
    }
  };

  const rowForAssign: LicenseRow | null = data
    ? {
        id: data.id,
        licenseKey: data.licenseKey,
        product: data.product,
        planSlug: data.planSlug,
        status: data.status as LicenseRow["status"],
        tenantId: data.tenantId,
        tenantName: data.tenantName,
        tenantSlug: data.tenantSlug,
        isPerpetual: data.isPerpetual,
        activatedAt: data.activatedAt,
        validFrom: data.validFrom ?? null,
        expiresAt: data.expiresAt,
        maxActivations: data.maxActivations,
        activationCount: data.activationCount,
        gracePeriodDays: data.gracePeriodDays,
        revokedAt: data.revokedAt,
        revokeReason: data.revokeReason,
        notes: data.notes,
        createdAt: data.createdAt,
      }
    : null;

  const keyTail = data ? data.licenseKey.slice(-9) : "";

  const activeWithOffline = data
    ? data.activations.filter(
        (a) => a.activationStatus === "active" && a.offlineTokenExpiresAt,
      )
    : [];
  const earliestOffline = activeWithOffline.length
    ? activeWithOffline
        .map((a) => new Date(a.offlineTokenExpiresAt!).getTime())
        .sort((a, b) => a - b)[0]!
    : null;

  return {
    id,
    data,
    loading,
    error,
    keyTail,
    isSuper,
    canExtendOrEditNotes,
    canSupportLicenseOps,
    activeTab,
    setActiveTab,
    history,
    historyLoading,
    assignOpen,
    setAssignOpen,
    revokeOpen,
    setRevokeOpen,
    revokeReason,
    setRevokeReason,
    suspendOpen,
    setSuspendOpen,
    suspendReason,
    setSuspendReason,
    reactivateOpen,
    setReactivateOpen,
    deactivateAct,
    setDeactivateAct,
    blacklistAct,
    setBlacklistAct,
    blacklistReason,
    setBlacklistReason,
    notesEdit,
    setNotesEdit,
    notesDraft,
    setNotesDraft,
    notesSaving,
    extendOpen,
    setExtendOpen,
    extendInitial,
    setExtendInitial,
    rowForAssign,
    activeWithOffline,
    earliestOffline,
    load,
    saveNotes,
  };
}
