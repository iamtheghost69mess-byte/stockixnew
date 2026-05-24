"use client";

import { useEffect, useMemo, useState } from "react";

import Link from "next/link";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Database, History, Loader2, MapPin, Plus, Scan, Search } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  fetchIngredients,
  fetchLocations,
  INGREDIENTS_QUERY_KEY,
  type LocationRow,
} from "@/lib/inventory-api";
import { posCan } from "@/lib/pos-permissions";
import { fetchSerials, registerSerial, SERIALS_QUERY_KEY } from "@/lib/pos-serial-api";
import { usePosAuthStore } from "@/stores/pos-auth-store";

/**
 * Prefer a branch named "Main" or coded MAIN; otherwise first location (API order).
 */
function resolveDefaultLocationId(locations: readonly LocationRow[]): string {
  if (locations.length === 0) return "";
  const byName = locations.find((loc) => loc.name?.trim().toLowerCase() === "main");
  if (byName) return byName._id;
  const byCode = locations.find((loc) => loc.code?.trim().toUpperCase() === "MAIN");
  if (byCode) return byCode._id;
  return locations[0]?._id ?? "";
}

export default function SerialSearchPage() {
  const [search, setSearch] = useState("");
  const [registerOpen, setRegisterOpen] = useState(false);
  const [serialInput, setSerialInput] = useState("");
  const [selectedIngredient, setSelectedIngredient] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("");

  const queryClient = useQueryClient();
  const permissions = usePosAuthStore((s) => s.user?.permissions ?? []);
  const canWrite = posCan(permissions, "backoffice.inventory.write");

  const { data: serialsRes, isLoading } = useQuery({
    queryKey: [SERIALS_QUERY_KEY, search],
    queryFn: () => fetchSerials({ serial: search || undefined }),
    enabled: true,
  });

  const { data: ingredientsRes } = useQuery({
    queryKey: INGREDIENTS_QUERY_KEY,
    queryFn: () => fetchIngredients({ status: "active" }),
    enabled: registerOpen,
  });
  const serialTrackedIngredients = (Array.isArray(ingredientsRes?.data) ? ingredientsRes.data : []).filter(
    (ing) => ing.isSerialTracked,
  );

  const { data: locationsRes } = useQuery({
    queryKey: ["locations-for-serial"],
    queryFn: () => fetchLocations(),
    enabled: registerOpen,
  });
  const locations = useMemo(
    () => (Array.isArray(locationsRes?.data) ? locationsRes.data : []),
    [locationsRes?.data],
  );
  const defaultLocationId = useMemo(() => resolveDefaultLocationId(locations), [locations]);

  useEffect(() => {
    if (!registerOpen) return;
    setSelectedLocation((prev) => {
      if (prev) return prev;
      return defaultLocationId;
    });
  }, [registerOpen, defaultLocationId]);

  const registerMutation = useMutation({
    mutationFn: () =>
      registerSerial({
        serial: serialInput.trim(),
        ingredientId: selectedIngredient,
        locationId: selectedLocation || undefined,
      }),
    onSuccess: () => {
      toast.success("Serial registered.");
      setRegisterOpen(false);
      setSerialInput("");
      setSelectedIngredient("");
      setSelectedLocation("");
      void queryClient.invalidateQueries({ queryKey: [SERIALS_QUERY_KEY] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to register serial."),
  });

  const serials = serialsRes?.data || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Serialized Unit Tracker</h1>
          <p className="text-muted-foreground mt-1">
            Global search for specific inventory units. Audit the movement history of serialized items.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by exact serial number or scan..."
            className="pl-8 bg-card shadow-sm h-12 text-lg"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button size="lg" variant="outline" className="h-12 px-6">
          <Scan className="mr-2 h-5 w-5" /> Scan Unit
        </Button>
        {canWrite ? (
          <Button size="lg" className="h-12 px-6" onClick={() => setRegisterOpen(true)}>
            <Plus className="mr-2 h-5 w-5" /> Register serial
          </Button>
        ) : null}
      </div>

      <Dialog
        open={registerOpen}
        onOpenChange={(open) => {
          setRegisterOpen(open);
          if (!open) {
            setSerialInput("");
            setSelectedIngredient("");
            setSelectedLocation("");
          }
        }}
        modal={false}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Register serial number</DialogTitle>
            <DialogDescription>
              Only ingredients flagged as <code className="font-mono">isSerialTracked</code> are listed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="serial-input">Serial</Label>
              <Input
                id="serial-input"
                value={serialInput}
                onChange={(e) => setSerialInput(e.target.value)}
                placeholder="e.g. SN-ABC-00001"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Ingredient</Label>
              <Select value={selectedIngredient} onValueChange={setSelectedIngredient}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a serial-tracked ingredient" />
                </SelectTrigger>
                <SelectContent position="popper" className="z-[60] w-[var(--radix-select-trigger-width)]">
                  {serialTrackedIngredients.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      No serial-tracked ingredients. Enable the flag on an ingredient first.
                    </div>
                  ) : (
                    serialTrackedIngredients.map((ing) => (
                      <SelectItem key={ing._id} value={ing._id}>
                        {ing.name || "Unnamed"}
                        {ing.serialNumberFormat ? ` · ${ing.serialNumberFormat}` : ""}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Location</Label>
              <p className="text-muted-foreground text-xs">Defaults to Main when available.</p>
              <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a location" />
                </SelectTrigger>
                <SelectContent position="popper" className="z-[60] w-[var(--radix-select-trigger-width)]">
                  {locations.map((loc) => (
                    <SelectItem key={loc._id} value={loc._id}>
                      {loc.name || loc._id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRegisterOpen(false);
                setSerialInput("");
                setSelectedIngredient("");
                setSelectedLocation("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => registerMutation.mutate()}
              disabled={registerMutation.isPending || !serialInput.trim() || !selectedIngredient}
            >
              {registerMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Register
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-[200px]">Serial Number</TableHead>
              <TableHead>Ingredient / SKU</TableHead>
              <TableHead>Current Status</TableHead>
              <TableHead>Current Location</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-6 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-28" />
                  </TableCell>
                  <TableCell className="text-right">
                    <Skeleton className="h-8 w-8 ml-auto" />
                  </TableCell>
                </TableRow>
              ))
            ) : serials.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-64 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-4 py-8">
                    <div className="p-4 rounded-full bg-muted">
                      <Database className="h-12 w-12 opacity-20" />
                    </div>
                    <div className="max-w-[300px] space-y-1">
                      <p className="font-semibold text-foreground">No units found</p>
                      <p className="text-sm">
                        Try searching for an exact serial number like "SN-8273" or scan a barcode.
                      </p>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              serials.map((sn) => (
                <TableRow key={sn._id} className="hover:bg-muted/30 transition-colors h-16">
                  <TableCell className="font-mono font-bold text-sm tracking-tight text-primary">{sn.serial}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">{sn.ingredient.name}</span>
                      <span className="text-[10px] text-muted-foreground uppercase">{sn.ingredient.sku}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <SerialStatusBadge status={sn.status} />
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" />
                      {sn.location?.name || "Unassigned"}
                      {sn.bin && <span className="opacity-50">/ {sn.bin.name}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/dashboard/inventory/serials/${sn.serial}`}>
                        Track History <History className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Recent Activity Search
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground italic">
                Use this tool to verify the authenticity and movement chain of high-value inventory items.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SerialStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "available":
      return (
        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 py-1">
          Available
        </Badge>
      );
    case "consumed":
      return (
        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 py-1">
          Consumed
        </Badge>
      );
    case "transferred":
      return (
        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 py-1">
          In Transit
        </Badge>
      );
    case "expired":
      return (
        <Badge variant="destructive" className="py-1">
          Expired
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}
