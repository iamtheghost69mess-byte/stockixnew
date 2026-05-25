"use client";

import { Copy, Plus } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { OwnerInviteDialog } from "./owner-invite-dialog";
import { OwnerRoleDialog } from "./owner-role-dialog";
import { OwnerTable } from "./owner-table";
import { useOwnersPage } from "./use-owners-page";

export function OwnersPageContent() {
  const {
    me,
    canManageOwners,
    owners,
    loadErr,
    loading,
    adding,
    addErr,
    deletingId,
    deleteErr,
    inviteUrl,
    copiedInvite,
    inviteOpen,
    inviteForm,
    onInviteSubmit,
    copyInviteUrl,
    openInviteDialog,
    closeInviteDialog,
    handleInviteOpenChange,
    roleDialogOpen,
    setRoleDialogOpen,
    roleChangeTarget,
    roleSaving,
    roleErr,
    roleSuccess,
    applyRoleChange,
    openRoleDialog,
    cancelRoleDialog,
    deleteTarget,
    deleteConfirmEmail,
    setDeleteConfirmEmail,
    executeDelete,
    openDeleteDialog,
    handleDeleteOpenChange,
    cancelDeleteDialog,
    copyOwnerId,
    resendingId,
    resendInvitation,
  } = useOwnersPage();

  return (
    <>
      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Invite platform admins with role-based access.
          </p>
          <Button
            type="button"
            className="gap-2"
            onClick={openInviteDialog}
            disabled={!canManageOwners}
          >
            <Plus className="h-4 w-4" />
            Invite owner
          </Button>
        </div>
        {addErr && <p className="text-sm text-destructive">{addErr}</p>}
        {roleErr ? (
          <Alert variant="destructive">
            <AlertDescription>{roleErr}</AlertDescription>
          </Alert>
        ) : null}
        {roleSuccess ? (
          <Alert>
            <AlertDescription>{roleSuccess}</AlertDescription>
          </Alert>
        ) : null}
        {inviteUrl && (
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground break-all">
              Invite link: {inviteUrl}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => void copyInviteUrl()}
            >
              <Copy className="mr-1 h-3 w-3" />
              {copiedInvite ? "Copied" : "Copy"}
            </Button>
          </div>
        )}
      </div>

      <OwnerInviteDialog
        open={inviteOpen}
        onOpenChange={handleInviteOpenChange}
        inviteForm={inviteForm}
        onSubmit={onInviteSubmit}
        adding={adding}
        onCancel={closeInviteDialog}
      />

      <OwnerTable
        me={me}
        canManageOwners={canManageOwners}
        owners={owners}
        loading={loading}
        loadErr={loadErr}
        deleteErr={deleteErr}
        deletingId={deletingId}
        deleteTarget={deleteTarget}
        deleteConfirmEmail={deleteConfirmEmail}
        onDeleteConfirmEmailChange={setDeleteConfirmEmail}
        onDeleteOpenChange={handleDeleteOpenChange}
        onCancelDelete={cancelDeleteDialog}
        onExecuteDelete={executeDelete}
        onOpenDelete={openDeleteDialog}
        onCopyOwnerId={copyOwnerId}
        onOpenRoleDialog={openRoleDialog}
        resendingId={resendingId}
        onResendInvitation={resendInvitation}
      />

      <OwnerRoleDialog
        open={roleDialogOpen}
        onOpenChange={setRoleDialogOpen}
        roleChangeTarget={roleChangeTarget}
        roleSaving={roleSaving}
        onCancel={cancelRoleDialog}
        onConfirm={applyRoleChange}
      />
    </>
  );
}
