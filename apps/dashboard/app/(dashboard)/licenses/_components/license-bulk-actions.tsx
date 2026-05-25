"use client";

import { Loader2 } from "lucide-react";
import { toast } from "@/components/reusabletoast";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { LicenseRow } from "@/types/license";
import { formatApiError } from "@/lib/api-errors";

export type LicenseBulkActionsProps = {
  revokeTarget: LicenseRow | null;
  onRevokeOpenChange: (open: boolean) => void;
  revokeReason: string;
  onRevokeReasonChange: (value: string) => void;
  revoking: boolean;
  onRevokingChange: (value: boolean) => void;
  onRevokeSuccess: () => void;
};

export function LicenseBulkActions({
  revokeTarget,
  onRevokeOpenChange,
  revokeReason,
  onRevokeReasonChange,
  revoking,
  onRevokingChange,
  onRevokeSuccess,
}: LicenseBulkActionsProps) {
  return (
    <AlertDialog open={revokeTarget !== null} onOpenChange={onRevokeOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke license?</AlertDialogTitle>
          <AlertDialogDescription>
            License{" "}
            <span className="font-mono font-medium">{revokeTarget?.licenseKey}</span> will be
            permanently revoked. This cannot be undone. The tenant will lose access immediately.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-2 py-2">
          <Label htmlFor="revoke-reason-list">Reason (optional)</Label>
          <Textarea
            id="revoke-reason-list"
            placeholder="Why is this license being revoked?"
            value={revokeReason}
            onChange={(e) => onRevokeReasonChange(e.target.value)}
            rows={3}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={revoking}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={revoking}
            onClick={() => {
              void (async () => {
                if (!revokeTarget) return;
                onRevokingChange(true);
                try {
                  const res = await fetch(`/api/licenses/${revokeTarget.id}/revoke`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      reason: revokeReason.trim() || undefined,
                    }),
                  });
                  if (!res.ok) {
                    const body = (await res.json().catch(() => ({}))) as unknown;
                    toast.error(formatApiError(body, "Revoke failed"));
                    return;
                  }
                  toast.success("License revoked");
                  onRevokeSuccess();
                } catch {
                  toast.error("Failed to revoke license");
                } finally {
                  onRevokingChange(false);
                }
              })();
            }}
          >
            {revoking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Revoke
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
