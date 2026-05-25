"use client";

import { useEffect, useState } from "react";

import { PlusIcon } from "lucide-react";

import { PmsPageShell } from "@/components/pms-page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePmsTenant } from "@/hooks/use-pms-tenant";
import { pmsFetch } from "@/lib/pms-fetch";

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
  const [form, setForm] = useState({ name: "", type: "standard", capacity: "2", rateCents: "0" });

  async function loadProperties() {
    if (!tenantId) return;
    const res = await pmsFetch("properties", tenantId);
    const data = (await res.json()) as { properties?: Property[] };
    const list = data.properties ?? [];
    setProperties(list);
    if (!propertyId && list[0]) setPropertyId(list[0].id);
  }

  async function loadRooms() {
    if (!tenantId || !propertyId) return;
    const res = await pmsFetch(`rooms?propertyId=${propertyId}`, tenantId);
    const data = (await res.json()) as { rooms?: Room[] };
    setRooms(data.rooms ?? []);
  }

  useEffect(() => {
    setPropertyId("");
    setRooms([]);
  }, [tenantId]);

  useEffect(() => { void loadProperties(); }, [tenantId]);
  useEffect(() => { void loadRooms(); }, [tenantId, propertyId]);

  async function handleCreate() {
    if (!tenantId || !propertyId || !form.name) return;
    setSaving(true);
    await pmsFetch("rooms", tenantId, {
      method: "POST",
      body: JSON.stringify({
        propertyId,
        name: form.name,
        type: form.type,
        capacity: parseInt(form.capacity, 10),
        rateCents: parseInt(form.rateCents, 10),
      }),
    });
    setSaving(false);
    setOpen(false);
    void loadRooms();
  }

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
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
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
                  <TableCell className="tabular-nums">
                    {(r.rateCents / 100).toFixed(2)}
                  </TableCell>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add room</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Room 101" />
            </div>
            <div className="space-y-1">
              <Label>Type</Label>
              <Input value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} placeholder="standard" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Capacity</Label>
                <Input type="number" min={1} value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Rate (cents)</Label>
                <Input type="number" min={0} value={form.rateCents} onChange={(e) => setForm((f) => ({ ...f, rateCents: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleCreate()} disabled={saving || !form.name}>
              {saving ? "Saving…" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PmsPageShell>
  );
}
