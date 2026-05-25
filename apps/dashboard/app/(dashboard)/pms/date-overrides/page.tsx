"use client";

import { useEffect, useState } from "react";

import { PlusIcon, TrashIcon } from "lucide-react";

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
type Override = {
  id: string;
  propertyId: string;
  date: string;
  type: string;
  note: string;
};

export default function PmsDateOverridesPage() {
  const { tenantId } = usePmsTenant();
  const [properties, setProperties] = useState<Property[]>([]);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [filterProp, setFilterProp] = useState("all");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    propertyId: "", date: new Date().toISOString().slice(0, 10), type: "closed", note: "",
  });

  async function load() {
    if (!tenantId) return;
    const qs = filterProp !== "all" ? `?propertyId=${filterProp}` : "";
    const res = await pmsFetch(`date-overrides${qs}`, tenantId);
    setOverrides(((await res.json()) as { overrides?: Override[] }).overrides ?? []);
  }

  useEffect(() => {
    if (!tenantId) return;
    void (async () => {
      const res = await pmsFetch("properties", tenantId);
      const list = ((await res.json()) as { properties?: Property[] }).properties ?? [];
      setProperties(list);
      if (list[0] && !form.propertyId) setForm((f) => ({ ...f, propertyId: list[0]!.id }));
    })();
  }, [tenantId]);

  useEffect(() => { void load(); }, [tenantId, filterProp]);

  async function handleCreate() {
    if (!tenantId || !form.propertyId || !form.date) return;
    setSaving(true);
    await pmsFetch("date-overrides", tenantId, { method: "POST", body: JSON.stringify(form) });
    setSaving(false);
    setOpen(false);
    void load();
  }

  async function handleDelete(id: string) {
    if (!tenantId) return;
    await pmsFetch(`date-overrides/${id}`, tenantId, { method: "DELETE" });
    void load();
  }

  if (!tenantId) {
    return (
      <PmsPageShell title="Date Overrides">
        <p className="text-sm text-muted-foreground">Select a tenant on the Overview page first.</p>
      </PmsPageShell>
    );
  }

  return (
    <PmsPageShell title="Date Overrides" description="Block or open specific dates per property.">
      <div className="flex items-center gap-3">
        <Select value={filterProp} onValueChange={(v) => setFilterProp(v ?? "all")}>
          <SelectTrigger className="w-[220px]"><SelectValue placeholder="All properties" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All properties</SelectItem>
            {properties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" className="ml-auto" onClick={() => setOpen(true)}>
          <PlusIcon className="mr-1 h-4 w-4" /> Add override
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Property</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Note</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {overrides.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No overrides.
                </TableCell>
              </TableRow>
            ) : (
              overrides.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="text-xs text-muted-foreground font-mono">{o.propertyId.slice(0, 8)}…</TableCell>
                  <TableCell className="tabular-nums font-medium">{o.date}</TableCell>
                  <TableCell>
                    <Badge variant={o.type === "closed" ? "destructive" : "default"} className="capitalize">
                      {o.type}
                    </Badge>
                  </TableCell>
                  <TableCell>{o.note || "—"}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => void handleDelete(o.id)}>
                      <TrashIcon className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add date override</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Property</Label>
              <Select value={form.propertyId} onValueChange={(v) => setForm((f) => ({ ...f, propertyId: v ?? "" }))}>
                <SelectTrigger><SelectValue placeholder="Select property" /></SelectTrigger>
                <SelectContent>
                  {properties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Date</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v ?? "closed" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="closed">Closed</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Note (optional)</Label>
              <Input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleCreate()} disabled={saving || !form.propertyId}>
              {saving ? "Saving…" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PmsPageShell>
  );
}
