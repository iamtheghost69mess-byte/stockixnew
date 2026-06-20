"use client";

import Link from "next/link";
import { useState } from "react";
import { Copy, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "@/components/reusabletoast";

import { Alert, AlertDescription } from "@repo/ui/alert";
import { Button, buttonVariants } from "@repo/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@repo/ui/dialog";
import { ScrollArea } from "@repo/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/table";
import { formatApiError } from "@/lib/api-errors";
import { cn } from "@/lib/utils";
import type { TenantDetail } from "@/types/tenant";

import { readJson } from "./tenant-detail-utils";

export type TenantPosCredentialsProps = {
  tenant: TenantDetail;
  tenantId: string;
  posUrl: string | null;
  posOrgHref: string;
  canRevealPosPins: boolean;
};

export function TenantPosCredentials({
  tenant,
  tenantId,
  posUrl,
  posOrgHref,
  canRevealPosPins,
}: TenantPosCredentialsProps) {
  const hasPosModule = (tenant.modules ?? []).includes("pos");
  const [posCredentialsOpen, setPosCredentialsOpen] = useState(false);
  const [posCredentialsLoading, setPosCredentialsLoading] = useState(false);
  const [posCredentials, setPosCredentials] = useState<
    { role: string; username: string; pin: string; masked?: boolean }[]
  >([]);
  const [posPinResettingRole, setPosPinResettingRole] = useState<string | null>(null);

  const loadPosCredentials = async () => {
    setPosCredentialsLoading(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/pos-credentials`);
      const body = (await readJson(res)) as {
        roles?: { role: string; username: string; pin: string; masked?: boolean }[];
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        throw new Error(formatApiError(body, "Could not load POS credentials"));
      }
      setPosCredentials(Array.isArray(body.roles) ? body.roles : []);
      setPosCredentialsOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load POS credentials");
    } finally {
      setPosCredentialsLoading(false);
    }
  };

  const resetPosPin = async (role: string) => {
    setPosPinResettingRole(role);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/pos-credentials/reset-pin`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const body = (await readJson(res)) as {
        roles?: { role: string; username: string; pin: string; masked?: boolean }[];
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        throw new Error(formatApiError(body, "Could not reset PIN"));
      }
      setPosCredentials(Array.isArray(body.roles) ? body.roles : []);
      toast.success(`New PIN issued for ${role}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reset PIN");
    } finally {
      setPosPinResettingRole(null);
    }
  };

  const copyText = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Could not copy ${label}`);
    }
  };

  if (!hasPosModule) {
    return null;
  }

  return (
    <>
      <Card className="md:col-span-3">
        <CardHeader>
          <CardTitle>POS</CardTitle>
          <CardDescription>
            Point-of-sale stack for this tenant
            {tenant.posOrganizationId ? (
              <>
                {" "}
                ·{" "}
                <Link href={posOrgHref} className="text-primary underline-offset-4 hover:underline">
                  View POS organization
                </Link>
              </>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {posUrl ? (
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={posUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ size: "sm" }), "inline-flex")}
              >
                <ExternalLink className="mr-1 h-4 w-4" />
                Open POS
              </a>
              <span className="font-mono text-xs text-muted-foreground">{posUrl}</span>
            </div>
          ) : (
            <p className="text-muted-foreground">
              POS URL is not set yet. Complete provisioning or retry the POS stack.
            </p>
          )}
          {tenant.posBootstrapCredentials ? (
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-foreground">Bootstrap credentials</p>
                {canRevealPosPins ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={posCredentialsLoading}
                    onClick={() => void loadPosCredentials()}
                  >
                    {posCredentialsLoading ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : null}
                    View staff PINs
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                Bootstrap PINs are shown once during provisioning. After that, only masked values
                are stored — use <strong>Reset PIN</strong> per role to issue a new PIN.
              </p>
              <p>
                Admin PIN:{" "}
                <span className="font-mono">{tenant.posBootstrapCredentials.adminPinMasked}</span>
              </p>
              {tenant.posBootstrapCredentials.allRoles.length > 0 ? (
                <ul className="space-y-1 font-mono text-xs">
                  {tenant.posBootstrapCredentials.allRoles.map((row) => (
                    <li key={`${row.role}-${row.username}`}>
                      {row.role} / {row.username}: {row.pinMasked}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : canRevealPosPins ? (
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-foreground">Staff PINs</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={posCredentialsLoading}
                  onClick={() => void loadPosCredentials()}
                >
                  {posCredentialsLoading ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : null}
                  View staff PINs
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Plaintext PINs are not kept after bootstrap. Open the dialog to see masked roles
                and reset PINs as needed.
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Bootstrap PINs are only available briefly after provisioning (from provision
              status or this page while the encrypted secret event is still stored).
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={posCredentialsOpen}
        onOpenChange={(open) => {
          setPosCredentialsOpen(open);
          if (!open) setPosCredentials([]);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>POS staff PINs</DialogTitle>
          </DialogHeader>
          <Alert>
            <AlertDescription>
              Plaintext PINs are only returned immediately after provisioning or after you reset a
              role. Masked values cannot be recovered — use Reset PIN to issue a new one.
            </AlertDescription>
          </Alert>
          {posCredentials.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No staff roles found on the POS organization. Complete POS bootstrap first.
            </p>
          ) : posCredentials.every((row) => row.masked) ? (
            <>
              <Alert>
                <AlertDescription>
                  Bootstrap PINs are not stored in plaintext after provisioning. Each role below
                  shows a masked value — use <strong>Reset PIN</strong> to issue a new PIN you can
                  copy once.
                </AlertDescription>
              </Alert>
              <ScrollArea className="max-h-[360px] rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Role</TableHead>
                      <TableHead>Username</TableHead>
                      <TableHead>PIN</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {posCredentials.map((row) => (
                      <TableRow key={`${row.role}-${row.username}`}>
                        <TableCell className="font-medium capitalize">{row.role}</TableCell>
                        <TableCell className="font-mono text-xs">{row.username}</TableCell>
                        <TableCell className="font-mono text-sm text-muted-foreground">
                          {row.pin || "••••••"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={posPinResettingRole === row.role}
                            onClick={() => void resetPosPin(row.role)}
                          >
                            {posPinResettingRole === row.role ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "Reset PIN"
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </>
          ) : (
            <ScrollArea className="max-h-[360px] rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Role</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead>PIN</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {posCredentials.map((row) => (
                    <TableRow key={`${row.role}-${row.username}`}>
                      <TableCell className="font-medium capitalize">{row.role}</TableCell>
                      <TableCell className="font-mono text-xs">{row.username}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {row.masked ? (
                          <span className="text-muted-foreground" title="Masked — reset to reveal">
                            {row.pin || "••••••"}
                          </span>
                        ) : (
                          row.pin
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={row.masked}
                            onClick={() => void copyText(`${row.role} PIN`, row.pin)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={posPinResettingRole === row.role}
                            onClick={() => void resetPosPin(row.role)}
                          >
                            {posPinResettingRole === row.role ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "Reset PIN"
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setPosCredentialsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
