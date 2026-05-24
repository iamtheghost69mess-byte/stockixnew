"use client";

import { useEffect, useMemo, useState } from "react";

import { Info, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { PhoneInput } from "@/components/reui/phone-input";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { FloorTable, FloorTableStatus } from "@/lib/floor-table-types";
import { deriveFloorTableStatus, floorTableStatusModeForForm } from "@/lib/floor-table-types";
import { formatPosMutationError } from "@/lib/format-pos-api-error";
import { isHostessJobTitle } from "@/lib/pos-staff-role";
import { cn } from "@/lib/utils";
import { usePosAuthStore } from "@/stores/pos-auth-store";

type StatusMode = "auto" | FloorTableStatus;

function tableStatusInconsistencyHint(
  status: FloorTableStatus,
  personsSeated: number,
  reservatorName: string | null,
): string | null {
  const hasRes = Boolean(reservatorName?.trim());
  if (status === "available" && personsSeated > 0) {
    return "Status is Available but guests seated is greater than 0.";
  }
  if (status === "available" && hasRes) {
    return "Status is Available but a reservation name is set.";
  }
  if (status === "occupied" && personsSeated === 0 && !hasRes) {
    return "Status is Occupied but guests seated is 0 and there is no reservation name.";
  }
  if (status === "reserved" && !hasRes) {
    return "Status is Reserved but there is no reservation name.";
  }
  return null;
}

const emptyForm = (nextNo?: number) => ({
  tableNo: nextNo != null ? String(nextNo) : "",
  name: "",
  seats: "4",
  pricePerPerson: "0",
  reservatorName: "",
  reservatorPhone: "",
  reservatorIsVip: false,
  personsSeated: "0",
  statusMode: "auto" as StatusMode,
});

export type TableModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: FloorTable | null;
  existingTables?: FloorTable[];
  onSave: (payload: Omit<FloorTable, "id"> & { id?: string }) => void | Promise<void>;
  onDelete?: (id: string) => void | Promise<void>;
  /** ISO currency for labels / display (e.g. company currency from accounting config). */
  currency?: string;
};

export function TableModal({
  open,
  onOpenChange,
  editing,
  existingTables,
  onSave,
  onDelete,
  currency = "USD",
}: TableModalProps) {
  const user = usePosAuthStore((s) => s.user);
  /** Job-title hostess only — RBAC key "hostess" alone does not hide POS controls. */
  const hostessJob = isHostessJobTitle(user);
  const [form, setForm] = useState(emptyForm);
  const [showOnPos, setShowOnPos] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setDeleteOpen(false);
      setIsSaving(false);
      setIsDeleting(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        tableNo: String(editing.tableNo),
        name: editing.name,
        seats: String(editing.seats),
        pricePerPerson: String(editing.pricePerPerson),
        reservatorName: editing.reservatorName ?? "",
        reservatorPhone: editing.reservatorPhone ?? "",
        reservatorIsVip: editing.reservatorIsVip,
        personsSeated: String(editing.personsSeated),
        statusMode: floorTableStatusModeForForm(editing),
      });
    } else {
      const nextNo = Math.max(...(existingTables?.map((t) => t.tableNo) ?? []), 0) + 1;
      setForm(emptyForm(nextNo));
    }
  }, [open, editing, existingTables]);

  useEffect(() => {
    if (!open || hostessJob) return;
    setShowOnPos(editing ? editing.visibleInPos : false);
  }, [open, editing, hostessJob]);

  const parseNum = (raw: string, fallback: number) => {
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const tableNo = Math.floor(parseNum(form.tableNo, 0));
    if (tableNo < 1) {
      toast.error("Valid table number is required.");
      return;
    }
    const clash = existingTables?.find((t) => t.tableNo === tableNo && t.id !== editing?.id);
    if (clash) {
      toast.error(`Table number ${tableNo} is already in use by "${clash.name}".`);
      return;
    }

    const name = form.name.trim();
    if (!name) {
      toast.error("Table name is required.");
      return;
    }
    const seats = Math.max(1, Math.floor(parseNum(form.seats, 1)));
    let personsSeated = Math.max(0, Math.floor(parseNum(form.personsSeated, 0)));
    if (personsSeated > seats) {
      toast.warning(`Guests seated cannot exceed ${seats} (seat count).`);
      personsSeated = seats;
    }
    const pricePerPerson = Math.max(0, parseNum(form.pricePerPerson, 0));
    const resNameRaw = form.reservatorName.trim();
    const resPhoneRaw = form.reservatorPhone.trim();
    const reservatorName = resNameRaw ? resNameRaw : null;
    const reservatorPhone = resPhoneRaw ? resPhoneRaw : null;

    const autoStatus = deriveFloorTableStatus({ personsSeated, reservatorName });
    const status: FloorTableStatus = form.statusMode === "auto" ? autoStatus : form.statusMode;

    const visibleInPos = hostessJob ? (editing ? editing.visibleInPos : false) : showOnPos;

    const row: Omit<FloorTable, "id"> = {
      tableNo,
      name,
      seats,
      personsSeated,
      pricePerPerson,
      reservatorName,
      reservatorPhone,
      reservatorIsVip: form.reservatorIsVip,
      status,
      visibleInPos,
      floorAnchorX: editing ? editing.floorAnchorX : null,
      floorAnchorY: editing ? editing.floorAnchorY : null,
    };

    const inconsistency = tableStatusInconsistencyHint(status, personsSeated, reservatorName);
    if (inconsistency) {
      toast.warning(`${inconsistency} Saving anyway.`);
    }

    setIsSaving(true);
    try {
      if (editing) {
        await onSave({ ...row, id: editing.id });
      } else {
        await onSave(row);
      }
      onOpenChange(false);
      toast.success(editing ? "Table updated." : "Table created.");
    } catch (err) {
      toast.error(formatPosMutationError(err, { forbiddenHint: "You can't save tables for this branch." }));
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!editing || !onDelete) return;
    const tableId = editing.id?.trim();
    if (!tableId) {
      toast.error("This table has no id. Refresh the page and try again.");
      return;
    }
    setIsDeleting(true);
    try {
      await onDelete(tableId);
      setDeleteOpen(false);
      onOpenChange(false);
      toast.success("Table removed.");
    } catch (err) {
      toast.error(formatPosMutationError(err, { forbiddenHint: "You can't delete tables for this branch." }));
    } finally {
      setIsDeleting(false);
    }
  };

  const ccy = currency.trim().toUpperCase() || "USD";

  const statusAfterSaveLabel = useMemo(() => {
    const seats = Math.max(1, Math.floor(parseNum(form.seats, 1)));
    let personsSeated = Math.max(0, Math.floor(parseNum(form.personsSeated, 0)));
    if (personsSeated > seats) personsSeated = seats;
    const resNameRaw = form.reservatorName.trim();
    const reservatorName = resNameRaw ? resNameRaw : null;
    const autoStatus = deriveFloorTableStatus({ personsSeated, reservatorName });
    const status: FloorTableStatus = form.statusMode === "auto" ? autoStatus : form.statusMode;
    if (status === "reserved") return "Reserved";
    if (status === "occupied") return "Occupied";
    if (status === "billed") return "Billed (check open)";
    if (status === "closed") return "Closed (cleared)";
    return "Available";
  }, [form.personsSeated, form.reservatorName, form.seats, form.statusMode]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit table" : "Add table"}</DialogTitle>
              <DialogDescription>
                {hostessJob
                  ? "Update seating and reservation details for this branch. New tables stay hidden from Open POS until a manager enables them on the table."
                  : "Configure table details, saved status, and whether this table is shown on the Open POS floor."}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="floor-table-no">Table #</Label>
                  <Input
                    id="floor-table-no"
                    type="number"
                    min={1}
                    value={form.tableNo}
                    onChange={(e) => setForm((f) => ({ ...f, tableNo: e.target.value }))}
                    disabled={isSaving}
                  />
                </div>
                <div className="col-span-2 grid gap-2">
                  <Label htmlFor="floor-table-name">Table name / label</Label>
                  <Input
                    id="floor-table-name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. VIP Booth 1"
                    autoComplete="off"
                    disabled={isSaving}
                  />
                </div>
              </div>
              {!hostessJob ? (
                <div className="flex flex-col gap-3 rounded-lg border bg-card/60 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                  <div className="grid min-w-0 flex-1 gap-1.5">
                    <Label className="text-sm font-medium leading-none">Open POS floor</Label>
                    <p className="text-muted-foreground text-xs leading-relaxed">
                      When <span className="font-medium text-foreground">disabled</span>, this table is managed here only and
                      does not appear on the POS floor for servers.
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1.5 sm:items-end">
                    <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase sm:text-right">
                      Floor visibility
                    </span>
                    <div
                      className="inline-flex rounded-md border bg-background p-0.5 shadow-xs"
                      role="group"
                      aria-label="Open POS floor visibility"
                    >
                      <Button
                        type="button"
                        variant={showOnPos ? "default" : "ghost"}
                        size="sm"
                        className={cn(
                          "h-9 min-w-[5.75rem] rounded-sm px-3 shadow-none",
                          !showOnPos && "text-muted-foreground hover:text-foreground",
                        )}
                        disabled={isSaving}
                        onClick={() => setShowOnPos(true)}
                      >
                        Enable
                      </Button>
                      <Button
                        type="button"
                        variant={!showOnPos ? "secondary" : "ghost"}
                        size="sm"
                        className={cn(
                          "h-9 min-w-[5.75rem] rounded-sm px-3 shadow-none",
                          showOnPos && "text-muted-foreground hover:text-foreground",
                        )}
                        disabled={isSaving}
                        onClick={() => setShowOnPos(false)}
                      >
                        Disable
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="floor-seats">Total seats</Label>
                  <Input
                    id="floor-seats"
                    type="number"
                    min={1}
                    value={form.seats}
                    onChange={(e) => setForm((f) => ({ ...f, seats: e.target.value }))}
                    disabled={isSaving}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="floor-persons">Guests seated now</Label>
                  <Input
                    id="floor-persons"
                    type="number"
                    min={0}
                    autoComplete="off"
                    value={form.personsSeated}
                    onChange={(e) => setForm((f) => ({ ...f, personsSeated: e.target.value }))}
                    disabled={isSaving}
                  />
                  <p className="text-muted-foreground text-xs leading-snug">
                    Use <span className="font-medium text-foreground">0</span> for an empty table. With status set to
                    Automatic, any number greater than 0 saves as <span className="font-medium">Occupied</span> (not the same
                    as seat capacity).
                  </p>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="floor-price">Price per person ({ccy})</Label>
                <Input
                  id="floor-price"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.pricePerPerson}
                  onChange={(e) => setForm((f) => ({ ...f, pricePerPerson: e.target.value }))}
                  disabled={isSaving}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="floor-res-name">Reservator name (optional)</Label>
                <Input
                  id="floor-res-name"
                  value={form.reservatorName}
                  onChange={(e) => setForm((f) => ({ ...f, reservatorName: e.target.value }))}
                  placeholder="Guest name"
                  autoComplete="name"
                  disabled={isSaving}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="floor-res-phone">Reservator phone (optional)</Label>
                <PhoneInput
                  id="floor-res-phone"
                  autoComplete="tel"
                  placeholder="Enter phone number"
                  disabled={isSaving}
                  value={form.reservatorPhone || undefined}
                  onChange={(v) => setForm((f) => ({ ...f, reservatorPhone: v ?? "" }))}
                />
              </div>
              <div className="flex flex-col gap-3 rounded-lg border bg-card/60 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                <div className="grid min-w-0 flex-1 gap-1.5">
                  <Label htmlFor="floor-vip" className="text-sm font-medium leading-none">
                    VIP customer
                  </Label>
                  <p className="text-muted-foreground text-xs leading-relaxed">Shows a gold star on the floor card.</p>
                </div>
                <div className="flex shrink-0 items-center sm:justify-end">
                  <Switch
                    id="floor-vip"
                    checked={form.reservatorIsVip}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, reservatorIsVip: v }))}
                    disabled={isSaving}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select
                  value={form.statusMode}
                  onValueChange={(v) => setForm((f) => ({ ...f, statusMode: v as StatusMode }))}
                  disabled={isSaving}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Automatic (from guests & reservation)</SelectItem>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="reserved">Reserved</SelectItem>
                    <SelectItem value="occupied">Occupied</SelectItem>
                    <SelectItem value="billed">Billed</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Alert className="border-muted bg-muted/40">
                <Info className="size-4" aria-hidden />
                <AlertDescription className="text-sm">
                  <span className="font-medium text-foreground">Status after save:</span>{" "}
                  <span className="text-foreground">{statusAfterSaveLabel}</span>
                  {form.statusMode === "auto" ? (
                    <span className="mt-1 block text-muted-foreground text-xs">
                      Automatic follows guests seated and reservation name. Pick a specific status above to override.
                    </span>
                  ) : null}
                </AlertDescription>
              </Alert>
            </div>
            <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
              <div>
                {editing && onDelete ? (
                  <Button type="button" variant="destructive" disabled={isSaving} onClick={() => setDeleteOpen(true)}>
                    Delete
                  </Button>
                ) : null}
              </div>
              <div className="flex w-full justify-end gap-2 sm:w-auto">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving} className="inline-flex gap-2">
                  {isSaving ? (
                    <>
                      <Loader2 className="size-4 shrink-0 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    "Save"
                  )}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this table?</AlertDialogTitle>
            <AlertDialogDescription>
              {editing ? (
                <>
                  <span className="font-medium text-foreground">{editing.name}</span> will be removed from this branch.
                  This cannot be undone. If the table has an open check in POS, delete will be blocked by the server.
                </>
              ) : (
                "This table will be removed."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={isDeleting}
              className="inline-flex gap-2"
              onClick={() => void confirmDelete()}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="size-4 shrink-0 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete table"
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
