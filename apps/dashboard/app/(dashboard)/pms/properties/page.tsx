"use client";

import { useEffect, useState } from "react";

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
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
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

type Property = {
  id: string;
  name: string;
  type: string;
  city: string | null;
  country: string | null;
  checkInTime: string;
  checkOutTime: string;
  minNights: number;
  cleaningEnabled: boolean;
};

export default function PmsPropertiesPage() {
  const { tenantId } = usePmsTenant();
  const [rows, setRows] = useState<Property[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", type: "hotel", address: "", city: "", country: "" });

  async function load() {
    if (!tenantId) return;
    const res = await pmsFetch("properties", tenantId);
    const data = (await res.json()) as { properties?: Property[] };
    setRows(data.properties ?? []);
  }

  useEffect(() => { void load(); }, [tenantId]);

  async function handleCreate() {
    if (!tenantId || !form.name) return;
    setSaving(true);
    await pmsFetch("properties", tenantId, { method: "POST", body: JSON.stringify(form) });
    setSaving(false);
    setOpen(false);
    setForm({ name: "", type: "hotel", address: "", city: "", country: "" });
    void load();
  }

  if (!tenantId) {
    return (
      <PmsPageShell title="Properties">
        <p className="text-sm text-muted-foreground">Select a tenant on the Overview page first.</p>
      </PmsPageShell>
    );
  }

  return (
    <PmsPageShell title="Properties" description="Manage properties for this tenant.">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen(true)}>
          <PlusIcon className="mr-1 h-4 w-4" /> New property
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Check-in / out</TableHead>
              <TableHead>Min nights</TableHead>
              <TableHead>Cleaning</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No properties yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="capitalize">{p.type}</TableCell>
                  <TableCell>{[p.city, p.country].filter(Boolean).join(", ") || "—"}</TableCell>
                  <TableCell className="tabular-nums">{p.checkInTime} / {p.checkOutTime}</TableCell>
                  <TableCell>{p.minNights}</TableCell>
                  <TableCell>
                    <Badge variant={p.cleaningEnabled ? "default" : "secondary"}>
                      {p.cleaningEnabled ? "On" : "Off"}
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
          <DialogHeader>
            <DialogTitle>New property</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {(["name", "type", "address", "city", "country"] as const).map((field) => (
              <div key={field} className="space-y-1">
                <Label className="capitalize">{field}</Label>
                <Input
                  value={form[field]}
                  onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                  placeholder={field}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleCreate()} disabled={saving || !form.name}>
              {saving ? "Saving…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PmsPageShell>
  );
}
