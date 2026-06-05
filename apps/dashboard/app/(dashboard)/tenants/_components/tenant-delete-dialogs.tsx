"use client";

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TenantSlugConfirmField } from "./tenant-slug-confirm-field";

type TenantDeleteDialogsProps = {
  deleteConfirmOpen: boolean;
  setDeleteConfirmOpen: (open: boolean) => void;
  deleteVolumesOpen: boolean;
  setDeleteVolumesOpen: (open: boolean) => void;
  deleteTarget: { tenantId: string; slug: string } | null;
  setDeleteTarget: (target: { tenantId: string; slug: string } | null) => void;
  deleteSlugInput: string;
  setDeleteSlugInput: (value: string) => void;
  isDeletingTenant: boolean;
  deleteProgressMessage: string | null;
  executeTenantDelete: (
    tenantId: string,
    slug: string,
    wipeVolumes: boolean,
  ) => void | Promise<void>;
};

export function TenantDeleteDialogs({
  deleteConfirmOpen,
  setDeleteConfirmOpen,
  deleteVolumesOpen,
  setDeleteVolumesOpen,
  deleteTarget,
  setDeleteTarget,
  deleteSlugInput,
  setDeleteSlugInput,
  isDeletingTenant,
  deleteProgressMessage,
  executeTenantDelete,
}: TenantDeleteDialogsProps) {
  return (
    <>
      <Dialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          setDeleteConfirmOpen(open);
          if (!open) {
            setDeleteSlugInput("");
            setDeleteTarget(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete tenant</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This runs docker compose down, removes the tenant from Stockix, and deletes provision logs. This cannot be
            undone. Copy the tenant slug below and paste it into the confirmation field to continue.
          </p>
          {deleteTarget ? (
            <TenantSlugConfirmField
              slug={deleteTarget.slug}
              value={deleteSlugInput}
              onChange={setDeleteSlugInput}
              inputId="delete-tenant-slug-confirm"
            />
          ) : null}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setDeleteConfirmOpen(false);
                setDeleteSlugInput("");
                setDeleteTarget(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!deleteTarget || deleteSlugInput !== deleteTarget.slug}
              onClick={() => {
                if (!deleteTarget || deleteSlugInput !== deleteTarget.slug) return;
                setDeleteConfirmOpen(false);
                setDeleteVolumesOpen(true);
              }}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteVolumesOpen}
        onOpenChange={(open) => {
          if (!open && isDeletingTenant) return;
          setDeleteVolumesOpen(open);
          if (!open) {
            setDeleteTarget(null);
            setDeleteSlugInput("");
          }
        }}
      >
        <DialogContent showCloseButton={!isDeletingTenant}>
          {isDeletingTenant ? (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <Loader2 className="size-10 animate-spin text-primary" aria-hidden />
              <DialogHeader className="space-y-2 text-center sm:text-center">
                <DialogTitle>Deleting tenant</DialogTitle>
              </DialogHeader>
              <p className="max-w-sm text-sm text-muted-foreground">
                {deleteProgressMessage ?? "Removing deployment…"}
              </p>
              {deleteTarget ? (
                <p className="font-mono text-xs text-muted-foreground">{deleteTarget.slug}</p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                The stack is stopped and removal is queued. This dialog closes when the request is accepted;
                Docker cleanup may continue for up to a minute in the background.
              </p>
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Also delete Docker volumes?</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Delete volumes removes MySQL / Mongo / Redis data for this stack. Keep volumes if you may need the data
                later (containers are still removed).
              </p>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  variant="outline"
                  disabled={!deleteTarget}
                  onClick={() => {
                    if (!deleteTarget) return;
                    void executeTenantDelete(deleteTarget.tenantId, deleteTarget.slug, false);
                  }}
                >
                  Keep volumes
                </Button>
                <Button
                  variant="destructive"
                  disabled={!deleteTarget}
                  onClick={() => {
                    if (!deleteTarget) return;
                    void executeTenantDelete(deleteTarget.tenantId, deleteTarget.slug, true);
                  }}
                >
                  Delete volumes
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
