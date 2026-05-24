"use client";

import { useMemo, useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { ResourcePage } from "@/components/resource-page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatPosMutationError } from "@/lib/format-pos-api-error";
import {
  createLocation,
  deleteLocation,
  type LocationRow,
  type LocationWritePayload,
  updateLocation,
} from "@/lib/inventory-api";
import { type ResourceDefinition, ResourceRegistry } from "@/lib/mdd/resource-config";
import { posCan } from "@/lib/pos-permissions";
import { usePosAuthStore } from "@/stores/pos-auth-store";

const LOC_NAME_MAX = 200;
const LOC_CODE_MAX = 32;
const LOC_ADDRESS_MAX = 500;

const FORBIDDEN_LOCATIONS =
  "You can't add or edit branches with your current role. A manager can grant **backoffice.location.write** or **backoffice.***.";

function validateLocationForm(
  name: string,
  code: string,
  address: string,
  vatRatePercent: string,
): string | null {
  const n = name.trim();
  if (!n) return "Branch name is required.";
  if (n.length > LOC_NAME_MAX) return `Branch name must be at most ${LOC_NAME_MAX} characters.`;
  const c = code.trim();
  if (c.length > LOC_CODE_MAX) return `Code must be at most ${LOC_CODE_MAX} characters.`;
  const a = address.trim();
  if (a.length > LOC_ADDRESS_MAX) return `Address must be at most ${LOC_ADDRESS_MAX} characters.`;
  const vRaw = vatRatePercent.trim();
  if (vRaw.length > 0) {
    const v = Number(vRaw);
    if (!Number.isFinite(v) || v < 0 || v > 100) {
      return "VAT rate must be between 0 and 100 (percent), or leave blank for 0.";
    }
  }
  return null;
}

export default function LocationsPage() {
  const queryClient = useQueryClient();
  const permissions = usePosAuthStore((s) => s.user?.permissions);
  const canWrite = posCan(permissions, "backoffice.location.write");

  const [editing, setEditing] = useState<LocationRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LocationRow | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  const [waiterCanPrintReceipt, setWaiterCanPrintReceipt] = useState(false);
  const [vatRateStr, setVatRateStr] = useState("");
  const [vatInclusive, setVatInclusive] = useState(false);
  const [kitchenWorkflowEnabled, setKitchenWorkflowEnabled] = useState(true);
  const [discountReasonRequired, setDiscountReasonRequired] = useState(true);

  const locationsResource: ResourceDefinition = useMemo(() => {
    const base = ResourceRegistry.locations;
    if (canWrite) return base;
    return {
      ...base,
      columns: base.columns.filter((c) => c.key !== "actions"),
    };
  }, [canWrite]);

  const createMutation = useMutation({
    mutationFn: createLocation,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: [ResourceRegistry.locations.id] });
      toast.success(`Location "${res.data?.name ?? "branch"}" created.`);
      closeDialog();
    },
    onError: (error: unknown) => toast.error(formatPosMutationError(error, { forbiddenHint: FORBIDDEN_LOCATIONS })),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: LocationWritePayload }) => updateLocation(id, data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: [ResourceRegistry.locations.id] });
      toast.success(`Location "${res.data?.name ?? "branch"}" updated.`);
      closeDialog();
    },
    onError: (error: unknown) => toast.error(formatPosMutationError(error, { forbiddenHint: FORBIDDEN_LOCATIONS })),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteLocation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ResourceRegistry.locations.id] });
      toast.success("Location deleted.");
    },
    onError: (error: unknown) => toast.error(formatPosMutationError(error, { forbiddenHint: FORBIDDEN_LOCATIONS })),
  });

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditing(null);
    setName("");
    setCode("");
    setAddress("");
    setWaiterCanPrintReceipt(false);
    setVatRateStr("");
    setVatInclusive(false);
    setKitchenWorkflowEnabled(true);
    setDiscountReasonRequired(true);
  };

  const handleOpenDialog = (loc?: LocationRow) => {
    if (!canWrite) {
      toast.error(FORBIDDEN_LOCATIONS);
      return;
    }
    if (loc) {
      setEditing(loc);
      setName(loc.name || "");
      setCode(loc.code || "");
      setAddress(loc.address || "");
      setWaiterCanPrintReceipt(Boolean(loc.waiterCanPrintReceipt));
      setVatRateStr(
        loc.vatRate != null && Number.isFinite(Number(loc.vatRate)) ? String(Number(loc.vatRate)) : "",
      );
      setVatInclusive(Boolean(loc.vatInclusive));
      setKitchenWorkflowEnabled(loc.kitchenWorkflowEnabled !== false);
      setDiscountReasonRequired(loc.discountReasonRequired !== false);
    } else {
      setEditing(null);
      setName("");
      setCode("");
      setAddress("");
      setWaiterCanPrintReceipt(false);
      setVatRateStr("");
      setVatInclusive(false);
      setKitchenWorkflowEnabled(true);
      setDiscountReasonRequired(true);
    }
    setIsDialogOpen(true);
  };

  const handleSave = () => {
    const err = validateLocationForm(name, code, address, vatRateStr);
    if (err) {
      toast.warning(err);
      return;
    }
    const trimmed = name.trim();
    const vatParsed = vatRateStr.trim() === "" ? 0 : Number(vatRateStr.trim());
    const data: LocationWritePayload = {
      name: trimmed,
      code: code.trim() || undefined,
      address: address.trim() || undefined,
      waiterCanPrintReceipt,
      vatRate: Number.isFinite(vatParsed) ? Math.min(100, Math.max(0, vatParsed)) : 0,
      vatInclusive,
      kitchenWorkflowEnabled,
      discountReasonRequired,
    };
    if (editing) {
      updateMutation.mutate({ id: editing._id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleAction = (row: unknown, actionId: string) => {
    if (!canWrite) {
      toast.error(FORBIDDEN_LOCATIONS);
      return;
    }
    const loc = row as LocationRow;
    if (actionId === "edit") {
      handleOpenDialog(loc);
    } else if (actionId === "delete") {
      setDeleteTarget(loc);
    }
  };

  const confirmDeleteLocation = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget._id, {
      onSuccess: () => setDeleteTarget(null),
    });
  };

  return (
    <>
      {!canWrite ? (
        <Alert className="border-amber-500/30 bg-amber-500/5">
          <AlertTitle className="text-amber-900 dark:text-amber-100">View only</AlertTitle>
          <AlertDescription className="text-sm text-muted-foreground">
            You can review branches but not add, edit, or delete them without **backoffice.location.write** (or
            **backoffice.***).
          </AlertDescription>
        </Alert>
      ) : null}

      <ResourcePage
        resource={locationsResource}
        onAction={handleAction}
        extraActions={
          canWrite ? (
            <Button onClick={() => handleOpenDialog()} className="gap-2">
              <Plus className="size-4" /> Add Branch
            </Button>
          ) : null
        }
      />

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Branch" : "New Branch"}</DialogTitle>
            <DialogDescription>Define branch details for POS floor and inventory scoping.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Branch Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Main Street"
                maxLength={LOC_NAME_MAX}
              />
              <p className="text-muted-foreground text-xs">Required. Matches API: trimmed, max {LOC_NAME_MAX} chars.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Code</Label>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="MST"
                  maxLength={LOC_CODE_MAX}
                />
                <p className="text-muted-foreground text-xs">Optional; stored uppercase (max {LOC_CODE_MAX}).</p>
              </div>
              <div className="space-y-2">
                <Label>Address</Label>
                <Input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Optional"
                  maxLength={LOC_ADDRESS_MAX}
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label className="text-sm">Allow waiters to print receipts</Label>
                <p className="text-xs text-muted-foreground">
                  Cashiers and managers are unaffected by this toggle.
                </p>
              </div>
              <Switch
                checked={waiterCanPrintReceipt}
                onCheckedChange={setWaiterCanPrintReceipt}
              />
            </div>
            <div className="space-y-3 rounded-md border p-3">
              <p className="text-sm font-medium text-foreground">Branch VAT (receipts &amp; reports)</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>VAT rate (%)</Label>
                  <Input
                    inputMode="decimal"
                    value={vatRateStr}
                    onChange={(e) => setVatRateStr(e.target.value)}
                    placeholder="0"
                  />
                  <p className="text-muted-foreground text-xs">0–100. Used on printed receipt when enabled.</p>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md bg-muted/30 p-3">
                  <div>
                    <Label className="text-sm">VAT-inclusive menu prices</Label>
                    <p className="text-xs text-muted-foreground">When on, branch VAT line shows “inclusive”.</p>
                  </div>
                  <Switch checked={vatInclusive} onCheckedChange={setVatInclusive} />
                </div>
              </div>
            </div>
            <div className="space-y-3 rounded-md border p-3">
              <p className="text-sm font-medium text-foreground">POS workflow</p>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label className="text-sm">Kitchen workflow (station tickets)</Label>
                  <p className="text-xs text-muted-foreground">
                    When off, send-to-kitchen updates the check but does not print station chits.
                  </p>
                </div>
                <Switch checked={kitchenWorkflowEnabled} onCheckedChange={setKitchenWorkflowEnabled} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label className="text-sm">Require discount reason</Label>
                  <p className="text-xs text-muted-foreground">
                    Applies at this branch before org-wide accounting defaults.
                  </p>
                </div>
                <Switch checked={discountReasonRequired} onCheckedChange={setDiscountReasonRequired} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {editing ? "Save Changes" : "Create Branch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && deleteTarget) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete branch?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-medium text-foreground">{deleteTarget?.name ?? "this location"}</span>? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmDeleteLocation}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
