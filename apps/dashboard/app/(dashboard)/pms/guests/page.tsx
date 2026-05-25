"use client";

import { useEffect, useState } from "react";

import { PlusIcon, SearchIcon, Users } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePmsTenant } from "@/hooks/use-pms-tenant";
import { pmsFetch } from "@/lib/pms-fetch";

type Guest = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  idType: string | null;
  idNumber: string | null;
  passportNumber: string | null;
  hasVisa: boolean | null;
};

export default function PmsGuestsPage() {
  const { tenantId } = usePmsTenant();
  const [guests, setGuests] = useState<Guest[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", email: "", phone: "", nationality: "",
    idType: "passport", idNumber: "", passportNumber: "",
  });

  async function load(q?: string) {
    if (!tenantId) return;
    const qs = q ? `?search=${encodeURIComponent(q)}` : "";
    const res = await pmsFetch(`guests${qs}`, tenantId);
    const data = (await res.json()) as { guests?: Guest[] };
    setGuests(data.guests ?? []);
  }

  useEffect(() => { void load(); }, [tenantId]);

  function handleSearch(e: React.ChangeEvent<HTMLInputElement>) {
    setSearch(e.target.value);
    void load(e.target.value);
  }

  async function handleCreate() {
    if (!tenantId || !form.name) return;
    setSaving(true);
    await pmsFetch("guests", tenantId, { method: "POST", body: JSON.stringify(form) });
    setSaving(false);
    setOpen(false);
    void load();
  }

  if (!tenantId) {
    return (
      <PmsPageShell title="Guests">
        <p className="text-sm text-muted-foreground">Select a tenant on the Overview page first.</p>
      </PmsPageShell>
    );
  }

  return (
    <PmsPageShell title="Guests" description="Guest directory with compliance fields.">
      <div className="flex items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search by name…"
            value={search}
            onChange={handleSearch}
          />
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <PlusIcon className="mr-1 h-4 w-4" /> New guest
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Nationality</TableHead>
              <TableHead>ID type</TableHead>
              <TableHead>Passport</TableHead>
              <TableHead>Visa</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {guests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="p-0">
                  <EmptyState
                    icon={Users}
                    title="No guests found"
                    description="Guests appear when bookings are created for this tenant."
                    className="border-0 bg-transparent"
                  />
                </TableCell>
              </TableRow>
            ) : (
              guests.map((g) => (
                <TableRow key={g.id}>
                  <TableCell className="font-medium">{g.name}</TableCell>
                  <TableCell>{g.email ?? "—"}</TableCell>
                  <TableCell>{g.phone ?? "—"}</TableCell>
                  <TableCell>{g.nationality ?? "—"}</TableCell>
                  <TableCell className="capitalize">{g.idType?.replace("_", " ") ?? "—"}</TableCell>
                  <TableCell>{g.passportNumber ?? g.idNumber ?? "—"}</TableCell>
                  <TableCell>
                    {g.hasVisa != null ? (
                      <Badge variant={g.hasVisa ? "default" : "secondary"}>
                        {g.hasVisa ? "Yes" : "No"}
                      </Badge>
                    ) : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New guest</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {([
              ["name", "Full name"],
              ["email", "Email"],
              ["phone", "Phone"],
              ["nationality", "Nationality"],
              ["idNumber", "ID number"],
              ["passportNumber", "Passport number"],
            ] as [keyof typeof form, string][]).map(([field, label]) => (
              <div key={field} className="space-y-1">
                <Label>{label}</Label>
                <Input
                  value={form[field]}
                  onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
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
