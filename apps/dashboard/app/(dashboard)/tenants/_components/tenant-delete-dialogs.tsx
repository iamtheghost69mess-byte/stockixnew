"use client";

import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@repo/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/dialog";
import { Input } from "@repo/ui/input";
import { TenantIdConfirmField } from "./tenant-id-confirm-field";

type DeleteProgress = {
  message: string;
  elapsedSec: number;
  slug: string;
  index?: number;
  total?: number;
};

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
  deleteProgress: DeleteProgress | null;
  executeTenantDelete: (
    tenantId: string,
    slug: string,
    wipeVolumes: boolean,
  ) => void | Promise<void>;
  bulkDeleteOpen: boolean;
  setBulkDeleteOpen: (open: boolean) => void;
  bulkDeleteTargets: { tenantId: string; slug: string }[];
  bulkDeleteConfirmInput: string;
  setBulkDeleteConfirmInput: (value: string) => void;
  isBulkDeleting: boolean;
  executeBulkDelete: () => void | Promise<void>;
  onCancelBulkDelete?: () => void;
  onCancelSingleDelete?: () => void;
};

function DeleteProgressPanel({
  progress,
  targets = [],
  onCancel,
}: {
  progress: DeleteProgress;
  targets?: { tenantId: string; slug: string }[];
  onCancel?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-4 text-center w-full">
      <Loader2 className="size-10 animate-spin text-primary" aria-hidden />
      <DialogHeader className="space-y-2 text-center sm:text-center">
        <DialogTitle>
          {progress.total != null && progress.total > 1
            ? `Deleting tenant ${progress.index ?? 1} of ${progress.total}`
            : "Deleting tenant"}
        </DialogTitle>
      </DialogHeader>
      <p className="font-mono text-sm text-foreground">{progress.slug}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{progress.message}</p>
      
      {targets.length > 0 && (
        <ul className="w-full max-h-40 overflow-y-auto rounded-md border bg-muted/30 px-3 py-2 text-left font-mono text-xs space-y-1">
          {targets.map((t, idx) => {
            const currentIdx = (progress.index ?? 1) - 1;
            const isCompleted = idx < currentIdx;
            const isCurrent = idx === currentIdx;
            return (
              <li
                key={t.tenantId}
                className={cn(
                  "flex items-center justify-between py-0.5",
                  isCompleted && "text-muted-foreground/60 line-through",
                  isCurrent && "font-bold text-primary animate-pulse",
                )}
              >
                <span>{t.slug}</span>
                <span>
                  {isCompleted ? "✓ Removed" : isCurrent ? "⚡ Removing..." : "Pending"}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        Elapsed {progress.elapsedSec}s — Docker cleanup runs in the worker; this dialog stays open until
        the tenant is fully removed.
      </p>

      {onCancel && (
        <Button
          variant="outline"
          size="sm"
          onClick={onCancel}
          className="mt-2 text-destructive hover:bg-destructive/10"
        >
          {progress.total != null && progress.total > 1 ? "Stop remaining deletions" : "Stop monitoring"}
        </Button>
      )}
    </div>
  );
}

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
  deleteProgress,
  executeTenantDelete,
  bulkDeleteOpen,
  setBulkDeleteOpen,
  bulkDeleteTargets,
  bulkDeleteConfirmInput,
  setBulkDeleteConfirmInput,
  isBulkDeleting,
  executeBulkDelete,
  onCancelBulkDelete,
  onCancelSingleDelete,
}: TenantDeleteDialogsProps) {
  const expectedBulkPhrase = `DELETE ${bulkDeleteTargets.length} TENANTS`;
  const bulkConfirmOk = bulkDeleteConfirmInput === expectedBulkPhrase;

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
            This stops all Docker stacks, removes persistent volumes and local images, deletes databases, and
            removes the tenant from Stockix. This operation is high-risk and irreversible. Type the exact Tenant ID (UUID) below to confirm.
          </p>
          {deleteTarget ? (
            <TenantIdConfirmField
              tenantId={deleteTarget.tenantId}
              value={deleteSlugInput}
              onChange={setDeleteSlugInput}
              inputId="delete-tenant-id-confirm"
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
              disabled={!deleteTarget || deleteSlugInput !== deleteTarget.tenantId}
              onClick={() => {
                if (!deleteTarget || deleteSlugInput !== deleteTarget.tenantId) return;
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
          {isDeletingTenant && deleteProgress ? (
            <DeleteProgressPanel
              progress={deleteProgress}
              onCancel={onCancelSingleDelete}
            />
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Remove completely?</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Remove completely stops containers, deletes Docker volumes and local images, and wipes MySQL /
                Mongo / Redis data for this tenant.
              </p>
              <DialogFooter className="flex-col gap-2 sm:flex-row sm:gap-0">
                <Button
                  variant="outline"
                  disabled={!deleteTarget}
                  onClick={() => {
                    if (!deleteTarget) return;
                    void executeTenantDelete(deleteTarget.tenantId, deleteTarget.slug, false);
                  }}
                >
                  Containers only
                </Button>
                <Button
                  variant="destructive"
                  disabled={!deleteTarget}
                  onClick={() => {
                    if (!deleteTarget) return;
                    void executeTenantDelete(deleteTarget.tenantId, deleteTarget.slug, true);
                  }}
                >
                  Remove completely
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={bulkDeleteOpen}
        onOpenChange={(open) => {
          if (!open && isBulkDeleting) return;
          setBulkDeleteOpen(open);
          if (!open) setBulkDeleteConfirmInput("");
        }}
      >
        <DialogContent showCloseButton={!isBulkDeleting}>
          {isBulkDeleting && deleteProgress ? (
            <DeleteProgressPanel
              progress={deleteProgress}
              targets={bulkDeleteTargets}
              onCancel={onCancelBulkDelete}
            />
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Delete {bulkDeleteTargets.length} tenants</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Each tenant will be removed completely (Docker stacks, volumes, images, and databases).
                Type <span className="font-mono font-medium text-foreground">{expectedBulkPhrase}</span> to confirm.
              </p>
              <ul className="max-h-40 overflow-y-auto rounded-md border bg-muted/30 px-3 py-2 text-left font-mono text-xs">
                {bulkDeleteTargets.map((t) => (
                  <li key={t.tenantId} className="py-0.5">
                    {t.slug}
                  </li>
                ))}
              </ul>
              <Input
                placeholder={`Type ${expectedBulkPhrase}`}
                value={bulkDeleteConfirmInput}
                onChange={(e) => setBulkDeleteConfirmInput(e.target.value)}
                autoComplete="off"
              />
              {bulkDeleteConfirmInput.length > 0 && bulkDeleteConfirmInput !== expectedBulkPhrase && (
                <p className="text-xs font-semibold text-destructive mt-1">
                  You must type {expectedBulkPhrase} exactly to confirm
                </p>
              )}
              <DialogFooter>
                <Button variant="ghost" onClick={() => setBulkDeleteOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={!bulkConfirmOk || bulkDeleteTargets.length === 0}
                  onClick={() => void executeBulkDelete()}
                >
                  Delete {bulkDeleteTargets.length} tenant{bulkDeleteTargets.length === 1 ? "" : "s"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
