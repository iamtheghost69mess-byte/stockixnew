"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { format } from "date-fns";
import {
  ArrowLeft,
  Copy,
  MoreHorizontal,
  Pencil,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import LicenseAssignDialog from "@/components/license-assign-dialog";
import LicenseStatusBadge from "@/components/license-status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useMe } from "@/hooks/use-me";
import type {
  LicenseActivation,
  LicenseDetail,
  LicenseRow,
  LicenseStatus,
} from "@/types/license";

function productLabel(p: string): string {
  if (p === "pos_desktop") return "POS Desktop";
  if (p === "bundle") return "Bundle";
  return "Platform";
}

export default function LicenseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const isSuper = me?.role === "super_admin";
  const [data, setData] = useState<LicenseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revokeReason, setRevokeReason] = useState("");
  const [deactivateAct, setDeactivateAct] = useState<LicenseActivation | null>(null);
  const [blacklistAct, setBlacklistAct] = useState<LicenseActivation | null>(null);
  const [blacklistReason, setBlacklistReason] = useState("");
  const [notesEdit, setNotesEdit] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/licenses/${id}`);
      const json = (await res.json().catch(() => ({}))) as {
        license?: LicenseDetail;
        error?: string;
      };
      if (res.status === 404) {
        setError("not_found");
        setData(null);
        return;
      }
      if (!res.ok || !json.license) {
        setError(json.error ?? `HTTP ${res.status}`);
        setData(null);
        return;
      }
      setData(json.license);
      setNotesDraft(json.license.notes ?? "");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveNotes = async () => {
    if (!data || !isSuper) return;
    setNotesSaving(true);
    try {
      const res = await fetch(`/api/licenses/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notesDraft }),
      });
      if (!res.ok) {
        toast.error("Failed to save notes");
        return;
      }
      toast.success("Notes saved");
      setNotesEdit(false);
      void load();
    } finally {
      setNotesSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error === "not_found" || !data) {
    return (
      <Alert variant="destructive">
        <AlertTitle>License not found</AlertTitle>
        <AlertDescription>
          <Link href="/licenses" className="font-medium underline">
            Back to licenses
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  const L = data;
  const keyTail = L.licenseKey.slice(-9);
  const activeWithOffline = L.activations.filter(
    (a) => a.activationStatus === "active" && a.offlineTokenExpiresAt,
  );
  const earliestOffline = activeWithOffline.length
    ? activeWithOffline
        .map((a) => new Date(a.offlineTokenExpiresAt!).getTime())
        .sort((a, b) => a - b)[0]!
    : null;

  const rowForAssign: LicenseRow = {
    id: L.id,
    licenseKey: L.licenseKey,
    product: L.product,
    planSlug: L.planSlug,
    status: L.status as LicenseRow["status"],
    tenantId: L.tenantId,
    tenantName: L.tenantName,
    tenantSlug: L.tenantSlug,
    isPerpetual: L.isPerpetual,
    activatedAt: L.activatedAt,
    expiresAt: L.expiresAt,
    maxActivations: L.maxActivations,
    activationCount: L.activationCount,
    gracePeriodDays: L.gracePeriodDays,
    revokedAt: L.revokedAt,
    revokeReason: L.revokeReason,
    notes: L.notes,
    createdAt: L.createdAt,
  };

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/licenses">Licenses</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="font-mono">{keyTail}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-2xl font-bold">{L.licenseKey}</h1>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => {
                void navigator.clipboard.writeText(L.licenseKey);
                toast.success("Copied");
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <LicenseStatusBadge status={L.status as LicenseStatus} />
            <Badge variant="outline">{productLabel(L.product)}</Badge>
            <Badge variant="secondary" className="capitalize">
              {L.planSlug}
            </Badge>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Assigned to:{" "}
            {L.tenantId ? (
              <Link href={`/tenants/${L.tenantId}`} className="text-foreground underline">
                {L.tenantName ?? L.tenantSlug}
              </Link>
            ) : (
              <span className="text-muted-foreground">Unassigned</span>
            )}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>License details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <p className="text-muted-foreground">Product</p>
                <p>{productLabel(L.product)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Plan</p>
                <p className="capitalize">{L.planSlug}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Status</p>
                <LicenseStatusBadge status={L.status as LicenseStatus} />
              </div>
              <div>
                <p className="text-muted-foreground">Activated</p>
                <p>{L.activatedAt ? format(new Date(L.activatedAt), "PPp") : "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Expires</p>
                <p>
                  {L.isPerpetual ? (
                    <Badge variant="secondary">Perpetual</Badge>
                  ) : L.expiresAt ? (
                    format(new Date(L.expiresAt), "PP")
                  ) : (
                    "—"
                  )}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Grace period</p>
                <p>{L.gracePeriodDays} days</p>
              </div>
              <div>
                <p className="text-muted-foreground">Max activations</p>
                <p>{L.maxActivations}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Current activations</p>
                <p>{L.activationCount}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Created by</p>
                <p>{L.createdByName ?? "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Created at</p>
                <p>{format(new Date(L.createdAt), "PPp")}</p>
              </div>
              {L.status === "revoked" ? (
                <div className="sm:col-span-2">
                  <p className="text-muted-foreground">Revoked</p>
                  <p>
                    {L.revokedAt ? format(new Date(L.revokedAt), "PPp") : "—"}
                    {L.revokeReason ? ` — ${L.revokeReason}` : ""}
                  </p>
                </div>
              ) : null}
              <div className="sm:col-span-2 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-muted-foreground">Notes</p>
                  {isSuper && !notesEdit ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setNotesEdit(true)}>
                      <Pencil className="mr-1 h-3.5 w-3.5" />
                      Edit
                    </Button>
                  ) : null}
                </div>
                {notesEdit && isSuper ? (
                  <div className="space-y-2">
                    <Textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} rows={3} />
                    <div className="flex gap-2">
                      <Button type="button" size="sm" disabled={notesSaving} onClick={() => void saveNotes()}>
                        {notesSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setNotesEdit(false);
                          setNotesDraft(L.notes ?? "");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{L.notes ?? "—"}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {L.status === "unassigned" ? (
              <Button className="w-full" onClick={() => setAssignOpen(true)}>
                Assign to tenant
              </Button>
            ) : null}
            {L.status === "active" && isSuper ? (
              <Button variant="destructive" className="w-full" onClick={() => setRevokeOpen(true)}>
                Revoke license
              </Button>
            ) : null}
            {L.status === "revoked" ? (
              <p className="text-sm text-muted-foreground">
                Revoked{L.revokedAt ? ` on ${format(new Date(L.revokedAt), "PP")}` : ""}.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

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
                      <button
                        type="button"
                        className="font-mono text-xs text-primary hover:underline"
                        title="Copy full fingerprint"
                        onClick={() => {
                          void navigator.clipboard.writeText(a.hardwareFingerprint);
                          toast.success("Fingerprint copied");
                        }}
                      >
                        {a.hardwareFingerprint.length > 16
                          ? `${a.hardwareFingerprint.slice(0, 16)}…`
                          : a.hardwareFingerprint}
                      </button>
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
                      <DropdownMenu>
                        <DropdownMenuTrigger>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {a.activationStatus === "active" ? (
                            <DropdownMenuItem onClick={() => setDeactivateAct(a)}>Deactivate</DropdownMenuItem>
                          ) : null}
                          {a.activationStatus !== "blacklisted" ? (
                            <DropdownMenuItem onClick={() => setBlacklistAct(a)}>
                              Blacklist device
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div>
        <Link href="/licenses" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to licenses
        </Link>
      </div>

      <LicenseAssignDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        license={rowForAssign}
        onSuccess={() => void load()}
      />

      <Dialog open={revokeOpen} onOpenChange={setRevokeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke license</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="revoke-reason">Reason (optional)</Label>
            <Input
              id="revoke-reason"
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRevokeOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                const res = await fetch(`/api/licenses/${L.id}/revoke`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ reason: revokeReason || undefined }),
                });
                if (!res.ok) {
                  toast.error("Revoke failed");
                  return;
                }
                toast.success("License revoked");
                setRevokeOpen(false);
                void load();
              }}
            >
              Revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deactivateAct)} onOpenChange={(o) => !o && setDeactivateAct(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate terminal</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This device will no longer count as an active activation.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeactivateAct(null)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!deactivateAct) return;
                const res = await fetch(
                  `/api/licenses/${L.id}/activations/${deactivateAct.id}/deactivate`,
                  { method: "POST" },
                );
                if (!res.ok) {
                  toast.error("Deactivate failed");
                  return;
                }
                toast.success("Deactivated");
                setDeactivateAct(null);
                void load();
              }}
            >
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(blacklistAct)} onOpenChange={(o) => !o && setBlacklistAct(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Blacklist this hardware fingerprint?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This permanently blocks this device from activating any license on this platform.
          </p>
          <div className="space-y-2">
            <Label htmlFor="bl-reason">Reason (optional)</Label>
            <Input
              id="bl-reason"
              value={blacklistReason}
              onChange={(e) => setBlacklistReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBlacklistAct(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!blacklistAct) return;
                const res = await fetch("/api/fingerprints/blacklist", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    hardwareFingerprint: blacklistAct.hardwareFingerprint,
                    reason: blacklistReason || undefined,
                  }),
                });
                if (!res.ok) {
                  toast.error("Blacklist failed");
                  return;
                }
                toast.success("Device blacklisted");
                setBlacklistAct(null);
                setBlacklistReason("");
                void load();
              }}
            >
              Blacklist
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
