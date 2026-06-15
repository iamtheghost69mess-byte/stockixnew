"use client";

import { useState } from "react";

import { Bell, Database, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { postInventoryBootstrapBalances, postInventoryRunAlerts } from "@/lib/inventory-api";
import { posCan } from "@/lib/pos-permissions";
import { usePosAuthStore } from "@/stores/pos-auth-store";

type PendingAction = null | "bootstrap" | "alerts";

type InventoryAdminToolsCardProps = {
  /** Called after a successful mutating tool so tabs refetch. */
  onDidMutate?: () => void;
};

export function InventoryAdminToolsCard({ onDidMutate }: InventoryAdminToolsCardProps) {
  const permissions = usePosAuthStore((state) => state.user?.permissions ?? []);
  const canRunAdminTools = posCan(permissions, "backoffice.*") || posCan(permissions, "backoffice.inventory.write");
  const [pending, setPending] = useState<PendingAction>(null);
  const [busy, setBusy] = useState(false);

  async function runBootstrap() {
    setBusy(true);
    try {
      const res = await postInventoryBootstrapBalances();
      const d = res.data;
      if (!d) {
        toast.error("Unexpected response from bootstrap.");
        return;
      }
      if (typeof d.message === "string" && d.message) {
        toast.message("Bootstrap finished", { description: d.message });
      } else {
        toast.success("Bootstrap finished", {
          description: `Created ${d.migrated} balance row(s) at the default location.`,
        });
      }
      onDidMutate?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bootstrap failed.");
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  async function runAlerts() {
    setBusy(true);
    try {
      const res = await postInventoryRunAlerts();
      const d = res.data;
      if (!d) {
        toast.error("Unexpected response from alert run.");
        return;
      }
      if ("skipped" in d && d.skipped) {
        toast.message("Alert run skipped", {
          description:
            d.reason === "disabled"
              ? "Inventory alerts are disabled in accounting settings."
              : d.reason === "no_webhook"
                ? "Configure an HTTPS webhook URL in accounting settings."
                : `Reason: ${d.reason}`,
        });
      } else if ("empty" in d && d.empty) {
        toast.message("Nothing to send", {
          description: "No low-stock or expiring-lot rows matched the current rules.",
        });
      } else if ("sent" in d && d.sent) {
        toast.success("Webhook delivered", {
          description: `Low-stock lines: ${d.lowStock}. Expiring lots: ${d.expiringLots}.`,
        });
      } else {
        toast.message("Alert run finished", { description: JSON.stringify(d) });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Alert run failed.");
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  return (
    <>
      <Card className="border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Inventory operations</CardTitle>
          <CardDescription>
            Restricted operations for inventory leads. Actions are logged server-side.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <Database className="size-4" />
            <AlertTitle>Initialize opening stock</AlertTitle>
            <AlertDescription className="text-muted-foreground">
              Creates missing opening-balance rows for ingredients that do not yet have stock records in the default
              location. Existing stock rows are not overwritten.
            </AlertDescription>
          </Alert>
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => setPending("bootstrap")}
            disabled={!canRunAdminTools}
          >
            <Database className="mr-2 size-4" />
            Initialize opening stock…
          </Button>

          <Alert>
            <Bell className="size-4" />
            <AlertTitle>Send inventory alert digest</AlertTitle>
            <AlertDescription className="text-muted-foreground">
              Sends low-stock and expiring-lot alerts to the configured webhook when alert delivery is enabled.
            </AlertDescription>
          </Alert>
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => setPending("alerts")}
            disabled={!canRunAdminTools}
          >
            <Bell className="mr-2 size-4" />
            Send alerts now…
          </Button>
        </CardContent>
      </Card>

      <Dialog open={pending != null} onOpenChange={(o) => !o && !busy && setPending(null)}>
        <DialogContent showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>
              {pending === "bootstrap"
                ? "Confirm opening stock initialization"
                : pending === "alerts"
                  ? "Send inventory alerts"
                  : ""}
            </DialogTitle>
            <DialogDescription>
              {pending === "bootstrap"
                ? "This only creates missing opening rows. It does not modify existing quantities."
                : pending === "alerts"
                  ? "This will call your external webhook endpoint. Confirm your integration is active before sending."
                  : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" disabled={busy} onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() => {
                if (pending === "bootstrap") void runBootstrap();
                else if (pending === "alerts") void runAlerts();
              }}
            >
              {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {pending === "bootstrap" ? "Initialize stock" : "Send alerts"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
