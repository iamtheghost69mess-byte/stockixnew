"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { PlusIcon } from "lucide-react";

import { PmsPageShell } from "@/components/pms-page-shell";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@repo/ui/form";
import { Input } from "@repo/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/table";
import { usePmsTenant } from "@/hooks/use-pms-tenant";
import { pmsFetch } from "@/lib/pms-fetch";
import { pmsRoomCreateSchema, type PmsRoomCreateValues } from "@/lib/schemas";

type Property = { id: string; name: string };
type Room = {
  id: string;
  propertyId: string;
  name: string;
  type: string;
  capacity: number;
  rateCents: number;
  status: string;
  floor: number | null;
};

const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  available: "default",
  occupied: "destructive",
  cleaning: "secondary",
  maintenance: "outline",
};

export default function PmsRoomsPage() {
  const { tenantId } = usePmsTenant();
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const form = useForm<PmsRoomCreateValues>({
    resolver: zodResolver(pmsRoomCreateSchema),
    defaultValues: { name: "", type: "standard", capacity: 2, rateCents: 0 },
  });

  async function loadProperties() {
    if (!tenantId) return;
    const res = await pmsFetch("properties", tenantId);
    const data = (await res.json()) as { properties?: Property[] };
    const list = data.properties ?? [];
    setProperties(list);
    if (!propertyId && list[0]) setPropertyId(list[0].id);
  }

  async function loadRooms(signal?: AbortSignal) {
    if (!tenantId || !propertyId) return;
    try {
      const res = await pmsFetch(`rooms?propertyId=${propertyId}`, tenantId, { signal });
      const data = (await res.json()) as { rooms?: Room[] };
      setRooms(data.rooms ?? []);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
  }

  useEffect(() => {
    setPropertyId("");
    setRooms([]);
  }, [tenantId]);

  useEffect(() => { void loadProperties(); }, [tenantId]);
  useEffect(() => {
    if (!tenantId || !propertyId) return;
    const ctrl = new AbortController();
    void loadRooms(ctrl.signal);
    return () => ctrl.abort();
  }, [tenantId, propertyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const onCreate = form.handleSubmit(async (data) => {
    if (!tenantId || !propertyId) return;
    setSaving(true);
    await pmsFetch("rooms", tenantId, {
      method: "POST",
      body: JSON.stringify({
        propertyId,
        name: data.name,
        type: data.type,
        capacity: data.capacity,
        rateCents: data.rateCents,
      }),
    });
    setSaving(false);
    setOpen(false);
    form.reset();
    void loadRooms();
  });

  if (!tenantId) {
    return (
      <PmsPageShell title="Rooms">
        <p className="text-sm text-muted-foreground">Select a tenant on the Overview page first.</p>
      </PmsPageShell>
    );
  }

  return (
    <PmsPageShell title="Rooms" description="Manage rooms by property.">
      <div className="flex items-center gap-3">
        <Select value={propertyId} onValueChange={(v) => setPropertyId(v ?? "")}>
          <SelectTrigger className="w-[260px]">
            <SelectValue placeholder="Select property" />
          </SelectTrigger>
          <SelectContent>
            {properties.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => setOpen(true)} disabled={!propertyId}>
          <PlusIcon className="mr-1 h-4 w-4" /> Add room
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Capacity</TableHead>
              <TableHead>Rate / night</TableHead>
              <TableHead>Floor</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rooms.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No rooms for this property.
                </TableCell>
              </TableRow>
            ) : (
              rooms.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="capitalize">{r.type}</TableCell>
                  <TableCell>{r.capacity}</TableCell>
                  <TableCell className="tabular-nums">{(r.rateCents / 100).toFixed(2)}</TableCell>
                  <TableCell>{r.floor ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_COLORS[r.status] ?? "outline"} className="capitalize">
                      {r.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) form.reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add room</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={onCreate} className="space-y-3">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Room 101" autoComplete="off" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="standard" autoComplete="off" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="capacity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Capacity</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          {...field}
                          onChange={(e) => field.onChange(e.target.value)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="rateCents"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rate (cents)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          {...field}
                          onChange={(e) => field.onChange(e.target.value)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Add"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </PmsPageShell>
  );
}
