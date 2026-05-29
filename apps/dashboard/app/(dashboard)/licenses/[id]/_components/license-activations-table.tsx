"use client";

import { format } from "date-fns";
import { MoreHorizontal } from "lucide-react";
import { toast } from "@/components/reusabletoast";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TabsContent } from "@/components/ui/tabs";
import { formatApiError } from "@/lib/api-errors";
import type { LicenseActivation, LicenseDetail } from "@/types/license";

type LicenseActivationsTableProps = {
  license: LicenseDetail;
  activeWithOffline: LicenseActivation[];
  earliestOffline: number | null;
  canSupportLicenseOps: boolean;
  isSuper: boolean;
  deactivateAct: LicenseActivation | null;
  onDeactivateActChange: (activation: LicenseActivation | null) => void;
  onBlacklistAct: (activation: LicenseActivation) => void;
  onReload: () => void;
};

export function LicenseActivationsTable({
  license: L,
  activeWithOffline,
  earliestOffline,
  canSupportLicenseOps,
  isSuper,
  deactivateAct,
  onDeactivateActChange,
  onBlacklistAct,
  onReload,
}: LicenseActivationsTableProps) {
  return (
    <>
      <TabsContent value="activations" className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>POS terminal activations</CardTitle>
            <CardDescription>Machines that have activated this license</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {earliestOffline ? (
              <Alert className="border-amber-500/50 bg-amber-500/10">
                <AlertTitle>Offline license mode</AlertTitle>
                <AlertDescription>
                  {activeWithOffline.length} terminal(s) operating in offline license mode. Earliest token
                  expiry: {format(new Date(earliestOffline), "PPp")}.
                </AlertDescription>
              </Alert>
            ) : null}
            {L.activations.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <p>No terminals have activated this license yet.</p>
                {(L.product === "pos_desktop" || L.product === "bundle") && (
                  <p className="mt-2 font-mono text-xs">{L.licenseKey}</p>
                )}
                {(L.product === "pos_desktop" || L.product === "bundle") && (
                  <p className="mt-1">Share this key with your POS terminals to activate.</p>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Machine</TableHead>
                    <TableHead>Fingerprint</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Offline token expires</TableHead>
                    <TableHead>Activated</TableHead>
                    <TableHead className="w-[50px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {L.activations.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>{a.machineName ?? "Unknown device"}</TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-auto p-0 font-mono text-xs text-primary hover:bg-transparent hover:underline"
                          title="Copy full fingerprint"
                          onClick={() => {
                            void navigator.clipboard.writeText(a.hardwareFingerprint);
                            toast.success("Fingerprint copied");
                          }}
                        >
                          {a.hardwareFingerprint.length > 16
                            ? `${a.hardwareFingerprint.slice(0, 16)}…`
                            : a.hardwareFingerprint}
                        </Button>
                      </TableCell>
                      <TableCell>{a.ipAddress ?? "—"}</TableCell>
                      <TableCell>
                        {a.activationStatus === "active" ? (
                          <Badge className="bg-emerald-600">Active</Badge>
                        ) : a.activationStatus === "deactivated" ? (
                          <Badge variant="secondary">Deactivated</Badge>
                        ) : (
                          <Badge variant="destructive">Blacklisted</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {a.offlineTokenExpiresAt
                          ? format(new Date(a.offlineTokenExpiresAt), "PP")
                          : "—"}
                      </TableCell>
                      <TableCell>{format(new Date(a.activatedAt), "PPp")}</TableCell>
                      <TableCell>
                        {(a.activationStatus === "active" && canSupportLicenseOps) ||
                        ((a.activationStatus === "active" || a.activationStatus === "deactivated") &&
                          isSuper) ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  aria-label="Activation actions"
                                />
                              }
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {a.activationStatus === "active" && canSupportLicenseOps ? (
                                <DropdownMenuItem onClick={() => onDeactivateActChange(a)}>
                                  Deactivate
                                </DropdownMenuItem>
                              ) : null}
                              {(a.activationStatus === "active" || a.activationStatus === "deactivated") &&
                              isSuper ? (
                                <DropdownMenuItem onClick={() => onBlacklistAct(a)}>
                                  Blacklist device
                                </DropdownMenuItem>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <AlertDialog
        open={Boolean(deactivateAct)}
        onOpenChange={(open) => !open && onDeactivateActChange(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate this terminal?</AlertDialogTitle>
            <AlertDialogDescription>
              The POS terminal will lose its activation immediately. The machine will need to re-activate to use the
              software.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deactivateAct) return;
                const res = await fetch(
                  `/api/licenses/${L.id}/activations/${deactivateAct.id}/deactivate`,
                  { method: "POST" },
                );
                if (!res.ok) {
                  const body = (await res.json().catch(() => ({}))) as unknown;
                  toast.error(formatApiError(body, "Deactivate failed"));
                  return;
                }
                toast.success("Deactivated");
                onDeactivateActChange(null);
                onReload();
              }}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
