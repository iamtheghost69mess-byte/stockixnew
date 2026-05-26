"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { toast } from "@/components/reusabletoast";

import { LicenseAssignDialog } from "@/components/license-assign-dialog";
import { LicenseExtendDialog } from "@/components/license-extend-dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatApiError } from "@/lib/api-errors";
import type { LicenseDetail } from "@/types/license";

import { LicenseActivationsTable } from "./license-activations-table";
import { LicenseBlacklistPanel } from "./license-blacklist-panel";
import { LicenseDetailHeader, LicenseDetailHero } from "./license-detail-header";
import { LicenseHistoryTable } from "./license-history-table";
import type { useLicenseDetailPage } from "./use-license-detail-page";

type LicenseDetailPageState = ReturnType<typeof useLicenseDetailPage>;

type LicenseDetailContentProps = {
  license: LicenseDetail;
  page: LicenseDetailPageState;
};

export function LicenseDetailContent({ license: L, page }: LicenseDetailContentProps) {
  const {
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
  } = page;

  const handleRevoke = async () => {
    const res = await fetch(`/api/licenses/${L.id}/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: revokeReason || undefined }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as unknown;
      toast.error(formatApiError(body, "Revoke failed"));
      return;
    }
    toast.success("License revoked");
    setRevokeOpen(false);
    void load();
  };

  const handleSuspend = async () => {
    const res = await fetch(`/api/licenses/${L.id}/suspend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: suspendReason || undefined }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      posSync?: string;
      errors?: string[];
    };
    if (!res.ok) {
      toast.error(formatApiError(body, "Suspend failed"));
      return;
    }
    if (body.posSync === "failed" || (body.errors?.length ?? 0) > 0) {
      toast.warning(
        "License suspended in Stockix, but POS sync failed. Check POS connectivity or errors in the response.",
      );
    } else {
      toast.success("License suspended");
    }
    setSuspendOpen(false);
    setSuspendReason("");
    void load();
  };

  const handleReactivate = async () => {
    const res = await fetch(`/api/licenses/${L.id}/reactivate`, { method: "POST" });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as unknown;
      toast.error(formatApiError(body, "Reactivate failed"));
      return;
    }
    toast.success("License reactivated");
    setReactivateOpen(false);
    void load();
  };

  return (
    <div className="space-y-6">
      <LicenseDetailHero license={L} keyTail={keyTail} />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="activations">Activations</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <LicenseDetailHeader
          license={L}
          isSuper={isSuper}
          canExtendOrEditNotes={canExtendOrEditNotes}
          notesEdit={notesEdit}
          notesDraft={notesDraft}
          notesSaving={notesSaving}
          revokeOpen={revokeOpen}
          revokeReason={revokeReason}
          onNotesEditChange={setNotesEdit}
          onNotesDraftChange={setNotesDraft}
          onSaveNotes={saveNotes}
          onAssignOpen={() => setAssignOpen(true)}
          onExtendOpen={() => {
            setExtendInitial({
              isPerpetual: L.isPerpetual,
              expiresAt: L.expiresAt,
            });
            setExtendOpen(true);
          }}
          onRevokeOpenChange={setRevokeOpen}
          onRevokeReasonChange={setRevokeReason}
          onRevoke={handleRevoke}
          suspendOpen={suspendOpen}
          suspendReason={suspendReason}
          reactivateOpen={reactivateOpen}
          onSuspendOpenChange={setSuspendOpen}
          onSuspendReasonChange={setSuspendReason}
          onSuspend={handleSuspend}
          onReactivateOpenChange={setReactivateOpen}
          onReactivate={handleReactivate}
        />

        <LicenseActivationsTable
          license={L}
          activeWithOffline={activeWithOffline}
          earliestOffline={earliestOffline}
          canSupportLicenseOps={canSupportLicenseOps}
          isSuper={isSuper}
          deactivateAct={deactivateAct}
          onDeactivateActChange={setDeactivateAct}
          onBlacklistAct={(a) => {
            setBlacklistReason("");
            setBlacklistAct(a);
          }}
          onReload={() => void load()}
        />

        <LicenseHistoryTable history={history} historyLoading={historyLoading} />
      </Tabs>

      <div>
        <Link
          href="/licenses"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to licenses
        </Link>
      </div>

      <LicenseExtendDialog
        open={extendOpen}
        onOpenChange={setExtendOpen}
        licenseId={L.id}
        initialIsPerpetual={extendInitial.isPerpetual}
        initialExpiresAt={extendInitial.expiresAt}
        onSuccess={() => void load()}
      />

      {rowForAssign ? (
        <LicenseAssignDialog
          open={assignOpen}
          onOpenChange={setAssignOpen}
          license={rowForAssign}
          onSuccess={() => void load()}
        />
      ) : null}

      <LicenseBlacklistPanel
        blacklistAct={blacklistAct}
        blacklistReason={blacklistReason}
        onBlacklistActChange={setBlacklistAct}
        onBlacklistReasonChange={setBlacklistReason}
        onReload={() => void load()}
      />
    </div>
  );
}
