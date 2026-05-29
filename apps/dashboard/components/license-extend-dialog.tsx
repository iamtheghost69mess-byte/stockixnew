"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { toast } from "@/components/reusabletoast";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatApiError } from "@/lib/api-errors";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  licenseId: string | null;
  onSuccess: () => void;
  initialIsPerpetual?: boolean;
  initialExpiresAt?: string | null;
};

export function LicenseExtendDialog({
  open,
  onOpenChange,
  licenseId,
  onSuccess,
  initialIsPerpetual = false,
  initialExpiresAt = null,
}: Props) {
  const [extendPerpetual, setExtendPerpetual] = useState(false);
  const [extendExpires, setExtendExpires] = useState<Date | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setExtendPerpetual(initialIsPerpetual);
      setExtendExpires(initialExpiresAt ? new Date(initialExpiresAt) : undefined);
      setSaving(false);
      return;
    }
    setExtendPerpetual(false);
    setExtendExpires(undefined);
    setSaving(false);
  }, [open, initialIsPerpetual, initialExpiresAt]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Extend license</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="extend-perp-shared"
              checked={extendPerpetual}
              onCheckedChange={(checked) => setExtendPerpetual(checked === true)}
            />
            <Label htmlFor="extend-perp-shared" className="text-sm font-normal">
              Perpetual (no expiry)
            </Label>
          </div>
          {!extendPerpetual ? (
            <div className="space-y-2">
              <Label>New expiry date</Label>
              <Popover>
                <PopoverTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      className={cn("w-full justify-start text-left font-normal")}
                    >
                      {extendExpires ? format(extendExpires, "PPP") : "Pick a date"}
                    </Button>
                  }
                />
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={extendExpires} onSelect={setExtendExpires} />
                </PopoverContent>
              </Popover>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!licenseId || saving || (!extendPerpetual && extendExpires === undefined)}
            onClick={() => {
              if (!licenseId) return;
              void (async () => {
                setSaving(true);
                try {
                  const body: { isPerpetual?: boolean; expiresAt?: string } = {};
                  if (extendPerpetual) body.isPerpetual = true;
                  else if (extendExpires) {
                    body.expiresAt = extendExpires.toISOString();
                    body.isPerpetual = false;
                  }
                  const res = await fetch(`/api/licenses/${licenseId}/extend`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                  });
                  if (!res.ok) {
                    const j = (await res.json().catch(() => ({}))) as unknown;
                    toast.error(formatApiError(j, "Extend failed"));
                    return;
                  }
                  toast.success("License updated");
                  onOpenChange(false);
                  onSuccess();
                } finally {
                  setSaving(false);
                }
              })();
            }}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
