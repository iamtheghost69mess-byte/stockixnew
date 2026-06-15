"use client";

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
import { formatApiError } from "@/lib/api-errors";
import type { LicenseActivation } from "@/types/license";

type LicenseBlacklistPanelProps = {
  blacklistAct: LicenseActivation | null;
  blacklistReason: string;
  onBlacklistActChange: (activation: LicenseActivation | null) => void;
  onBlacklistReasonChange: (value: string) => void;
  onReload: () => void;
};

export function LicenseBlacklistPanel({
  blacklistAct,
  blacklistReason,
  onBlacklistActChange,
  onBlacklistReasonChange,
  onReload,
}: LicenseBlacklistPanelProps) {
  return (
    <AlertDialog
      open={Boolean(blacklistAct)}
      onOpenChange={(open) => {
        if (!open) {
          onBlacklistActChange(null);
          onBlacklistReasonChange("");
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Blacklist this hardware fingerprint?</AlertDialogTitle>
          <AlertDialogDescription>
            This device will be permanently blocked from activating any license on this platform. This cannot be
            undone without contacting support.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="bl-reason">Reason (required, min. 10 characters)</Label>
          <Textarea
            id="bl-reason"
            value={blacklistReason}
            onChange={(e) => onBlacklistReasonChange(e.target.value)}
            rows={4}
            placeholder="Document why this device is being blacklisted"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={blacklistReason.trim().length < 10}
            onClick={async () => {
              if (!blacklistAct || blacklistReason.trim().length < 10) return;
              const res = await fetch("/api/fingerprints/blacklist", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  hardwareFingerprint: blacklistAct.hardwareFingerprint,
                  reason: blacklistReason.trim(),
                }),
              });
              if (!res.ok) {
                const body = (await res.json().catch(() => ({}))) as unknown;
                toast.error(formatApiError(body, "Blacklist failed"));
                return;
              }
              toast.success("Device blacklisted");
              onBlacklistActChange(null);
              onBlacklistReasonChange("");
              onReload();
            }}
          >
            Blacklist device
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
