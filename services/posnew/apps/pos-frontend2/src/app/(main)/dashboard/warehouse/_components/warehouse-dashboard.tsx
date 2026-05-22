"use client";

import { useMemo, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, Loader2, MapPin, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

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
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchLocationsList, normalizeLocationsQueryData } from "@/lib/inventory-api";
import { cn } from "@/lib/utils";
import {
  createWarehouseBin,
  createWarehouseZone,
  fetchWarehouseBins,
  fetchWarehouseZones,
  patchWarehouseBin,
  patchWarehouseZone,
  WAREHOUSE_BINS_QUERY_KEY,
  WAREHOUSE_ZONES_QUERY_KEY,
  type WarehouseBin,
  type WarehouseZone,
} from "@/lib/warehouse-api";

export function WarehouseDashboard() {
  const queryClient = useQueryClient();
  const [locationId, setLocationId] = useState<string>("");
  const [selectedZoneId, setSelectedZoneId] = useState<string>("");

  const [zoneDialogOpen, setZoneDialogOpen] = useState(false);
  const [zoneName, setZoneName] = useState("");
  const [zoneDescription, setZoneDescription] = useState("");

  const [binDialogOpen, setBinDialogOpen] = useState(false);
  const [binName, setBinName] = useState("");
  const [binDescription, setBinDescription] = useState("");
  const [binCapacity, setBinCapacity] = useState("");

  const [editZoneOpen, setEditZoneOpen] = useState(false);
  const [editZoneTarget, setEditZoneTarget] = useState<WarehouseZone | null>(null);
  const [editZoneName, setEditZoneName] = useState("");
  const [editZoneDescription, setEditZoneDescription] = useState("");
  const [editZoneStatus, setEditZoneStatus] = useState<"active" | "archived">("active");

  const [editBinOpen, setEditBinOpen] = useState(false);
  const [editBinTarget, setEditBinTarget] = useState<WarehouseBin | null>(null);
  const [editBinName, setEditBinName] = useState("");
  const [editBinDescription, setEditBinDescription] = useState("");
  const [editBinCapacity, setEditBinCapacity] = useState("");
  const [editBinStatus, setEditBinStatus] = useState<"active" | "archived">("active");

  const locationsQuery = useQuery({
    queryKey: ["locations"],
    queryFn: fetchLocationsList,
  });
  const locations = normalizeLocationsQueryData(locationsQuery.data);

  const zonesQuery = useQuery({
    queryKey: [...WAREHOUSE_ZONES_QUERY_KEY, locationId],
    queryFn: async () => {
      const res = await fetchWarehouseZones({ locationId: locationId || undefined });
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: Boolean(locationId),
  });

  const binsQuery = useQuery({
    queryKey: [...WAREHOUSE_BINS_QUERY_KEY, selectedZoneId],
    queryFn: async () => {
      const res = await fetchWarehouseBins({ zoneId: selectedZoneId });
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: Boolean(selectedZoneId),
  });

  const selectedZone = useMemo(
    () => zonesQuery.data?.find((z: WarehouseZone) => z._id === selectedZoneId),
    [zonesQuery.data, selectedZoneId],
  );

  const locationLabel = useMemo(() => {
    const l = locations.find((x) => x._id === locationId);
    return l?.name || l?.code || null;
  }, [locations, locationId]);

  const createZoneMutation = useMutation({
    mutationFn: () => {
      const name = zoneName.trim();
      if (!locationId) throw new Error("Select a location.");
      if (!name) throw new Error("Zone name is required.");
      return createWarehouseZone({
        location: locationId,
        name,
        description: zoneDescription.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success("Zone created.");
      void queryClient.invalidateQueries({ queryKey: WAREHOUSE_ZONES_QUERY_KEY });
      setZoneDialogOpen(false);
      setZoneName("");
      setZoneDescription("");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not create zone."),
  });

  const createBinMutation = useMutation({
    mutationFn: () => {
      const name = binName.trim();
      if (!selectedZoneId) throw new Error("Select a zone.");
      if (!name) throw new Error("Bin name is required.");
      const capRaw = binCapacity.trim();
      const capacity = capRaw === "" ? null : Number(capRaw);
      if (capacity != null && (!Number.isFinite(capacity) || capacity < 0)) {
        throw new Error("Capacity must be a non-negative number or empty.");
      }
      return createWarehouseBin({
        zone: selectedZoneId,
        name,
        description: binDescription.trim() || undefined,
        capacity,
      });
    },
    onSuccess: () => {
      toast.success("Bin created.");
      void queryClient.invalidateQueries({ queryKey: WAREHOUSE_BINS_QUERY_KEY });
      setBinDialogOpen(false);
      setBinName("");
      setBinDescription("");
      setBinCapacity("");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not create bin."),
  });

  const patchZoneMutation = useMutation({
    mutationFn: () => {
      if (!editZoneTarget) throw new Error("No zone selected.");
      const name = editZoneName.trim();
      if (!name) throw new Error("Zone name is required.");
      return patchWarehouseZone(editZoneTarget._id, {
        name,
        description: editZoneDescription.trim() || undefined,
        status: editZoneStatus,
      });
    },
    onSuccess: () => {
      toast.success("Zone updated.");
      void queryClient.invalidateQueries({ queryKey: WAREHOUSE_ZONES_QUERY_KEY });
      setEditZoneOpen(false);
      setEditZoneTarget(null);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not update zone."),
  });

  const patchBinMutation = useMutation({
    mutationFn: () => {
      if (!editBinTarget) throw new Error("No bin selected.");
      const name = editBinName.trim();
      if (!name) throw new Error("Bin name is required.");
      const capRaw = editBinCapacity.trim();
      const capacity = capRaw === "" ? null : Number(capRaw);
      if (capacity != null && (!Number.isFinite(capacity) || capacity < 0)) {
        throw new Error("Capacity must be a non-negative number or empty.");
      }
      return patchWarehouseBin(editBinTarget._id, {
        name,
        description: editBinDescription.trim() || undefined,
        capacity,
        status: editBinStatus,
      });
    },
    onSuccess: () => {
      toast.success("Bin updated.");
      void queryClient.invalidateQueries({ queryKey: WAREHOUSE_BINS_QUERY_KEY });
      setEditBinOpen(false);
      setEditBinTarget(null);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not update bin."),
  });

  function openEditZone(z: WarehouseZone) {
    setEditZoneTarget(z);
    setEditZoneName(z.name);
    setEditZoneDescription(z.description ?? "");
    setEditZoneStatus(z.status === "archived" ? "archived" : "active");
    setEditZoneOpen(true);
  }

  function openEditBin(b: WarehouseBin) {
    setEditBinTarget(b);
    setEditBinName(b.name);
    setEditBinDescription(b.description ?? "");
    setEditBinCapacity(b.capacity != null ? String(b.capacity) : "");
    setEditBinStatus(b.status === "archived" ? "archived" : "active");
    setEditBinOpen(true);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Boxes className="size-5" />
            <span className="font-medium text-xs uppercase tracking-wider">Operations</span>
          </div>
          <h1 className="font-semibold text-2xl tracking-tight md:text-3xl">Warehouse</h1>
          <p className="max-w-2xl text-muted-foreground text-sm leading-relaxed">
            Define storage <strong>zones</strong> per location, then <strong>bins</strong> inside each zone. Names must
            be unique per location (zones) and per zone (bins).
          </p>
        </div>
      </div>

      <Card className="overflow-hidden shadow-sm">
        <CardHeader className="border-b bg-muted/30 py-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base">Location context</CardTitle>
              <CardDescription>Zones are filtered by branch. Choose where you are structuring storage.</CardDescription>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-80">
              <Label className="text-muted-foreground text-xs">Branch</Label>
              {locationsQuery.isLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Select
                  value={locationId || undefined}
                  onValueChange={(v) => {
                    setLocationId(v);
                    setSelectedZoneId("");
                  }}
                >
                  <SelectTrigger className="bg-background">
                    <MapPin className="mr-2 size-4 text-muted-foreground" />
                    <SelectValue placeholder="Select location…" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => (
                      <SelectItem key={loc._id} value={loc._id}>
                        {loc.name || loc.code || loc._id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {!locationId ? (
        <Card className="border-dashed">
          <CardContent className="py-12">
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Select a location</EmptyTitle>
                <EmptyDescription>Pick a branch above to load and manage warehouse zones.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="flex min-h-[420px] flex-col shadow-sm">
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 border-b pb-4">
              <div>
                <CardTitle className="text-lg">Zones</CardTitle>
                <CardDescription className="mt-1">
                  {locationLabel ? (
                    <span>
                      At <span className="font-medium text-foreground">{locationLabel}</span>
                    </span>
                  ) : (
                    "Storage areas within this branch."
                  )}
                </CardDescription>
              </div>
              <Button type="button" size="sm" className="shrink-0 gap-1" onClick={() => setZoneDialogOpen(true)}>
                <Plus className="size-4" />
                New zone
              </Button>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col p-0">
              {zonesQuery.isLoading ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-lg" />
                  ))}
                </div>
              ) : zonesQuery.data?.length === 0 ? (
                <div className="flex flex-1 items-center justify-center p-8">
                  <Empty>
                    <EmptyHeader>
                      <EmptyTitle>No zones yet</EmptyTitle>
                      <EmptyDescription>
                        Create the first zone for this location (e.g. Cold room, Dry storage).
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </div>
              ) : (
                <ScrollArea className="h-[min(52vh,420px)]">
                  <ul className="divide-y p-2">
                    {zonesQuery.data?.map((z: WarehouseZone) => {
                      const active = z._id === selectedZoneId;
                      const archived = z.status === "archived";
                      return (
                        <li key={z._id} className="flex gap-1 pr-1">
                          <button
                            type="button"
                            onClick={() => setSelectedZoneId(z._id)}
                            className={cn(
                              "flex min-w-0 flex-1 flex-col gap-0.5 rounded-lg px-3 py-3 text-left transition-colors",
                              active ? "bg-primary/10 ring-1 ring-primary/20" : "hover:bg-muted/80",
                              archived && "opacity-70",
                            )}
                          >
                            <span className="flex items-center gap-2 font-medium text-foreground">
                              {z.name}
                              {archived ? (
                                <span className="rounded border border-border px-1.5 py-0 font-normal text-[10px] text-muted-foreground uppercase tracking-wide">
                                  Archived
                                </span>
                              ) : null}
                            </span>
                            {z.description ? (
                              <span className="line-clamp-2 text-muted-foreground text-xs">{z.description}</span>
                            ) : (
                              <span className="text-muted-foreground text-xs">No description</span>
                            )}
                          </button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="mt-2 size-8 shrink-0 text-muted-foreground"
                            title="Edit zone"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              openEditZone(z);
                            }}
                          >
                            <Pencil className="size-4" />
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          <Card className="flex min-h-[420px] flex-col shadow-sm">
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 border-b pb-4">
              <div>
                <CardTitle className="text-lg">Bins</CardTitle>
                <CardDescription className="mt-1">
                  {selectedZone ? (
                    <span>
                      In zone <span className="font-medium text-foreground">{selectedZone.name}</span>
                    </span>
                  ) : (
                    "Select a zone to view or add bins."
                  )}
                </CardDescription>
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="shrink-0 gap-1"
                disabled={!selectedZoneId}
                onClick={() => setBinDialogOpen(true)}
              >
                <Plus className="size-4" />
                New bin
              </Button>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col p-0">
              {!selectedZoneId ? (
                <div className="flex flex-1 items-center justify-center p-8">
                  <Empty>
                    <EmptyHeader>
                      <EmptyTitle>Choose a zone</EmptyTitle>
                      <EmptyDescription>Select a zone on the left to list its bins.</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </div>
              ) : binsQuery.isLoading ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead>Name</TableHead>
                          <TableHead className="hidden sm:table-cell">Description</TableHead>
                          <TableHead className="text-right">Capacity</TableHead>
                          <TableHead className="w-12 text-right"> </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(binsQuery.data?.length ?? 0) === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="h-32 text-center text-muted-foreground text-sm">
                              No bins in this zone yet.
                            </TableCell>
                          </TableRow>
                        ) : (
                          binsQuery.data?.map((b: WarehouseBin) => (
                            <TableRow key={b._id} className={b.status === "archived" ? "opacity-70" : undefined}>
                              <TableCell className="font-medium">
                                <span className="inline-flex items-center gap-2">
                                  {b.name}
                                  {b.status === "archived" ? (
                                    <span className="rounded border border-border px-1 py-0 font-normal text-[10px] text-muted-foreground uppercase">
                                      Archived
                                    </span>
                                  ) : null}
                                </span>
                              </TableCell>
                              <TableCell className="hidden max-w-[200px] truncate text-muted-foreground text-sm sm:table-cell">
                                {b.description || "—"}
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground text-sm tabular-nums">
                                {b.capacity != null ? b.capacity : "—"}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="size-8 text-muted-foreground"
                                  title="Edit bin"
                                  onClick={() => openEditBin(b)}
                                >
                                  <Pencil className="size-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  <Separator />
                  <p className="px-4 py-3 text-muted-foreground text-xs">
                    Bin capacity is optional metadata for planning; it does not enforce stock limits in the API.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={zoneDialogOpen} onOpenChange={setZoneDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New zone</DialogTitle>
            <DialogDescription>Add a storage zone at the selected location.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="wh-zone-name">Name</Label>
              <Input
                id="wh-zone-name"
                value={zoneName}
                onChange={(e) => setZoneName(e.target.value)}
                placeholder="e.g. Cold storage"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wh-zone-desc">Description (optional)</Label>
              <Input
                id="wh-zone-desc"
                value={zoneDescription}
                onChange={(e) => setZoneDescription(e.target.value)}
                placeholder="Short note for staff"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setZoneDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={createZoneMutation.isPending}
              onClick={() => void createZoneMutation.mutateAsync()}
            >
              {createZoneMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Create zone
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editZoneOpen}
        onOpenChange={(open) => {
          setEditZoneOpen(open);
          if (!open) setEditZoneTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit zone</DialogTitle>
            <DialogDescription>Update name, description, or archive this zone.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="wh-edit-zone-name">Name</Label>
              <Input
                id="wh-edit-zone-name"
                value={editZoneName}
                onChange={(e) => setEditZoneName(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wh-edit-zone-desc">Description</Label>
              <Input
                id="wh-edit-zone-desc"
                value={editZoneDescription}
                onChange={(e) => setEditZoneDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">Status</Label>
              <Select value={editZoneStatus} onValueChange={(v) => setEditZoneStatus(v as "active" | "archived")}>
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditZoneOpen(false);
                setEditZoneTarget(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={patchZoneMutation.isPending}
              onClick={() => void patchZoneMutation.mutateAsync()}
            >
              {patchZoneMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editBinOpen}
        onOpenChange={(open) => {
          setEditBinOpen(open);
          if (!open) setEditBinTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit bin</DialogTitle>
            <DialogDescription>Update bin details in {selectedZone?.name ?? "this zone"}.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="wh-edit-bin-name">Name</Label>
              <Input
                id="wh-edit-bin-name"
                value={editBinName}
                onChange={(e) => setEditBinName(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wh-edit-bin-desc">Description</Label>
              <Input
                id="wh-edit-bin-desc"
                value={editBinDescription}
                onChange={(e) => setEditBinDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wh-edit-bin-cap">Capacity (optional)</Label>
              <Input
                id="wh-edit-bin-cap"
                type="number"
                min={0}
                step="1"
                value={editBinCapacity}
                onChange={(e) => setEditBinCapacity(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">Status</Label>
              <Select value={editBinStatus} onValueChange={(v) => setEditBinStatus(v as "active" | "archived")}>
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditBinOpen(false);
                setEditBinTarget(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={patchBinMutation.isPending}
              onClick={() => void patchBinMutation.mutateAsync()}
            >
              {patchBinMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={binDialogOpen} onOpenChange={setBinDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New bin</DialogTitle>
            <DialogDescription>Add a bin inside {selectedZone?.name ?? "this zone"}.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="wh-bin-name">Name</Label>
              <Input
                id="wh-bin-name"
                value={binName}
                onChange={(e) => setBinName(e.target.value)}
                placeholder="e.g. Shelf A3"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wh-bin-desc">Description (optional)</Label>
              <Input id="wh-bin-desc" value={binDescription} onChange={(e) => setBinDescription(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wh-bin-cap">Capacity (optional)</Label>
              <Input
                id="wh-bin-cap"
                type="number"
                min={0}
                step="1"
                value={binCapacity}
                onChange={(e) => setBinCapacity(e.target.value)}
                placeholder="e.g. max units or kg"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setBinDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={createBinMutation.isPending}
              onClick={() => void createBinMutation.mutateAsync()}
            >
              {createBinMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Create bin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
