"use client";

import { Loader2 } from "lucide-react";

import { ROLE_DESCRIPTIONS, ROLE_LABELS, type Role } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { Owner } from "./use-owners-page";

export type OwnerRoleDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roleChangeTarget: { owner: Owner; nextRole: Role } | null;
  roleSaving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function OwnerRoleDialog({
  open,
  onOpenChange,
  roleChangeTarget,
  roleSaving,
  onCancel,
  onConfirm,
}: OwnerRoleDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {roleChangeTarget
              ? `Change role for ${roleChangeTarget.owner.name}?`
              : "Change role"}
          </DialogTitle>
        </DialogHeader>
        {roleChangeTarget ? (
          <div className="space-y-2 text-sm">
            <p>
              You are changing their role from{" "}
              <strong>{ROLE_LABELS[roleChangeTarget.owner.role]}</strong> to{" "}
              <strong>{ROLE_LABELS[roleChangeTarget.nextRole]}</strong>.
            </p>
            <p className="text-muted-foreground">
              {ROLE_DESCRIPTIONS[roleChangeTarget.nextRole]}
            </p>
            <p className="text-xs text-muted-foreground">
              This takes effect on their next login.
            </p>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={() => void onConfirm()} disabled={roleSaving}>
            {roleSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
