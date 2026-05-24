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
import { toast } from "@/components/reusabletoast";

import { LicenseAssignDialog } from "@/components/license-assign-dialog";
import { LicenseExtendDialog } from "@/components/license-extend-dialog";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMe } from "@/hooks/use-me";
import { formatApiError } from "@/lib/api-errors";
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

type LicenseHistoryEntry = {
  id: string;
  licenseId: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  previousValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  notes: string | null;
  createdAt: string;
};

function getActionVariant(
  action: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (action === "revoked" || action === "expired_by_worker") return "destructive";
  if (action === "generated" || action === "assigned") return "default";
  if (action === "extended") return "secondary";
  return "outline";
}

function formatHistoryAction(action: string): string {
  return action.replace(/_/g, " ");
}

export default function LicenseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const isSuper = me?.role === "super_admin";
  const canExtendOrEditNotes = Boolean(me?.capabilities.canExtendLicenses);
  const canSupportLicenseOps = me?.role === "support_agent" || me?.role === "super_admin";
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
  const [extendOpen, setExtendOpen] = useState(false);
  const [extendInitial, setExtendInitial] = useState<{
    isPerpetual: boolean;
    expiresAt: string | null;
  }>({ isPerpetual: false, expiresAt: null });
  const [activeTab, setActiveTab] = useState("overview");
  const [history, setHistory] = useState<LicenseHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const load = useCallback((): Promise<void> => {
    return (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/licenses/${id}`);
        const jsonUnknown = await res.json().catch(() => ({}));
        const json = jsonUnknown as {
          license?: LicenseDetail;
          error?: string;
        };
        if (res.status === 404) {
          setError("not_found");
          setData(null);
          return;
        }
        if (!res.ok || !json.license) {
          setError(formatApiError(jsonUnknown, json.error ?? `HTTP ${res.status}`));
          setData(null);
          return;
        }
        setData(json.license);
        setNotesDraft(json.license.notes ?? "");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (activeTab !== "history" || !id) return;
    void (async () => {
      setHistoryLoading(true);
      try {
        const res = await fetch(`/api/licenses/${id}/history?pageSize=100`);
        const json = (await res.json().catch(() => ({}))) as {
          history?: LicenseHistoryEntry[];
        };
        if (res.ok && Array.isArray(json.history)) {
          setHistory(json.history);
        } else {
          setHistory([]);
        }
      } catch {
        setHistory([]);
      } finally {
        setHistoryLoading(false);
      }
    })();
  }, [activeTab, id]);

  const saveNotes = async () => {
    if (!data || !canExtendOrEditNotes) return;
    setNotesSaving(true);
    try {
      const res = await fetch(`/api/licenses/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notesDraft }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as unknown;
        toast.error(formatApiError(body, "Failed to save notes"));
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
    validFrom: L.validFrom ?? null,
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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="activations">Activations</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
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
                <p className="text-muted-foreground">Valid from</p>
                <p>
                  {L.validFrom
                    ? format(new Date(L.validFrom), "PPp")
                    : L.activatedAt
                      ? format(new Date(L.activatedAt), "PPp")
                      : "—"}
                </p>
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
                  {canExtendOrEditNotes && !notesEdit ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setNotesEdit(true)}>
                      <Pencil className="mr-1 h-3.5 w-3.5" />
                      Edit
                    </Button>
                  ) : null}
                </div>
                {notesEdit && canExtendOrEditNotes ? (
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
            {L.status === "unassigned" && isSuper ? (
              <Button className="w-full" onClick={() => setAssignOpen(true)}>
                Assign to tenant
              </Button>
            ) : null}
            {canExtendOrEditNotes && (L.status === "active" || L.status === "expired") ? (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setExtendInitial({
                    isPerpetual: L.isPerpetual,
                    expiresAt: L.expiresAt,
                  });
                  setExtendOpen(true);
                }}
              >
                Extend or set perpetual
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
        </TabsContent>

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
                              <DropdownMenuItem onClick={() => setDeactivateAct(a)}>Deactivate</DropdownMenuItem>
                            ) : null}
                            {(a.activationStatus === "active" || a.activationStatus === "deactivated") &&
                            isSuper ? (
                              <DropdownMenuItem
                                onClick={() => {
                                  setBlacklistReason("");
                                  setBlacklistAct(a);
                                }}
                              >
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

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>License history</CardTitle>
              <CardDescription>Append-only audit trail for this license</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {historyLoading ? (
                <p className="text-sm text-muted-foreground">Loading history…</p>
              ) : history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No history recorded yet.</p>
              ) : (
                history.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex flex-col gap-2 border-b border-border/60 pb-4 last:border-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0 flex-1 space-y-2">
                      <Badge variant={getActionVariant(entry.action)} className="capitalize">
                        {formatHistoryAction(entry.action)}
                      </Badge>
                      {entry.actorEmail ? (
                        <p className="text-sm text-muted-foreground">by {entry.actorEmail}</p>
                      ) : null}
                      {entry.notes ? (
                        <p className="text-sm">{entry.notes}</p>
                      ) : null}
                      {entry.newValues ? (
                        <pre className="max-h-40 overflow-auto rounded-md bg-muted/50 p-2 text-xs">
                          {JSON.stringify(entry.newValues, null, 2)}
                        </pre>
                      ) : null}
                    </div>
                    <p className="shrink-0 text-xs text-muted-foreground sm:text-sm">
                      {format(new Date(entry.createdAt), "PPp")}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div>
        <Link href="/licenses" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to licenses
        </Link>
      </div>

      <LicenseExtendDialog
        open={extendOpen}
        onOpenChange={setExtendOpen}
        licenseId={data?.id ?? null}
        initialIsPerpetual={extendInitial.isPerpetual}
        initialExpiresAt={extendInitial.expiresAt}
        onSuccess={() => void load()}
      />

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
                  const body = (await res.json().catch(() => ({}))) as unknown;
                  toast.error(formatApiError(body, "Revoke failed"));
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

      <AlertDialog open={Boolean(deactivateAct)} onOpenChange={(open) => !open && setDeactivateAct(null)}>
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
                setDeactivateAct(null);
                void load();
              }}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(blacklistAct)}
        onOpenChange={(open) => {
          if (!open) {
            setBlacklistAct(null);
            setBlacklistReason("");
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
              onChange={(e) => setBlacklistReason(e.target.value)}
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
                setBlacklistAct(null);
                setBlacklistReason("");
                void load();
              }}
            >
              Blacklist device
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
