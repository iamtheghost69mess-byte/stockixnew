"use client";

import Link from "next/link";
import { format } from "date-fns";
import { Copy, Loader2, Pencil } from "lucide-react";
import { toast } from "@/components/reusabletoast";

import LicenseStatusBadge from "@/components/license-status-badge";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TabsContent } from "@/components/ui/tabs";
import type { LicenseDetail, LicenseStatus } from "@/types/license";

import { productLabel } from "./license-detail-utils";

type LicenseDetailHeaderProps = {
  license: LicenseDetail;
  keyTail: string;
  isSuper: boolean;
  canExtendOrEditNotes: boolean;
  notesEdit: boolean;
  notesDraft: string;
  notesSaving: boolean;
  revokeOpen: boolean;
  revokeReason: string;
  onNotesEditChange: (value: boolean) => void;
  onNotesDraftChange: (value: string) => void;
  onSaveNotes: () => void;
  onAssignOpen: () => void;
  onExtendOpen: () => void;
  onRevokeOpenChange: (open: boolean) => void;
  onRevokeReasonChange: (value: string) => void;
  onRevoke: () => Promise<void>;
};

export function LicenseDetailHero({ license: L, keyTail }: Pick<LicenseDetailHeaderProps, "license" | "keyTail">) {
  return (
    <>
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
            <BreadcrumbPage className="font-mono">{L.licenseKey}</BreadcrumbPage>
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
    </>
  );
}

export function LicenseDetailHeader({
  license: L,
  isSuper,
  canExtendOrEditNotes,
  notesEdit,
  notesDraft,
  notesSaving,
  revokeOpen,
  revokeReason,
  onNotesEditChange,
  onNotesDraftChange,
  onSaveNotes,
  onAssignOpen,
  onExtendOpen,
  onRevokeOpenChange,
  onRevokeReasonChange,
  onRevoke,
}: Omit<LicenseDetailHeaderProps, "keyTail">) {
  return (
    <>
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
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onNotesEditChange(true)}
                      >
                        <Pencil className="mr-1 h-3.5 w-3.5" />
                        Edit
                      </Button>
                    ) : null}
                  </div>
                  {notesEdit && canExtendOrEditNotes ? (
                    <div className="space-y-2">
                      <Textarea
                        value={notesDraft}
                        onChange={(e) => onNotesDraftChange(e.target.value)}
                        rows={3}
                      />
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={notesSaving}
                          onClick={() => void onSaveNotes()}
                        >
                          {notesSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            onNotesEditChange(false);
                            onNotesDraftChange(L.notes ?? "");
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
                <Button className="w-full" onClick={onAssignOpen}>
                  Assign to tenant
                </Button>
              ) : null}
              {canExtendOrEditNotes && (L.status === "active" || L.status === "expired") ? (
                <Button variant="outline" className="w-full" onClick={onExtendOpen}>
                  Extend or set perpetual
                </Button>
              ) : null}
              {L.status === "active" && isSuper ? (
                <Button variant="destructive" className="w-full" onClick={() => onRevokeOpenChange(true)}>
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

      <Dialog open={revokeOpen} onOpenChange={onRevokeOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke license</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="revoke-reason">Reason (optional)</Label>
            <Input
              id="revoke-reason"
              value={revokeReason}
              onChange={(e) => onRevokeReasonChange(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => onRevokeOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void onRevoke()}>
              Revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
