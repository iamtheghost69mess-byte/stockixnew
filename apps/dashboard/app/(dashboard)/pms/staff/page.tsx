"use client";

import { useEffect, useState } from "react";

import { CopyIcon, PlusIcon, TrashIcon } from "lucide-react";

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePmsTenant } from "@/hooks/use-pms-tenant";
import { pmsFetch } from "@/lib/pms-fetch";

type Staff = { id: string; name: string; role: string; email: string | null };
type Manager = { id: string; propertyId: string; staffId: string };
type Invite = {
  id: string;
  propertyId: string;
  token: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
};

export default function PmsStaffPage() {
  const { tenantId } = usePmsTenant();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [staffOpen, setStaffOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [staffForm, setStaffForm] = useState({ name: "", role: "receptionist", email: "" });
  const [inviteForm, setInviteForm] = useState({ propertyId: "", expiresInDays: "7" });
  const [copied, setCopied] = useState<string | null>(null);

  async function load() {
    if (!tenantId) return;
    const [sRes, mRes, iRes] = await Promise.all([
      pmsFetch("staff", tenantId),
      pmsFetch("staff/managers", tenantId),
      pmsFetch("staff/invites", tenantId),
    ]);
    setStaff(((await sRes.json()) as { staff?: Staff[] }).staff ?? []);
    setManagers(((await mRes.json()) as { managers?: Manager[] }).managers ?? []);
    setInvites(((await iRes.json()) as { invites?: Invite[] }).invites ?? []);
  }

  useEffect(() => { void load(); }, [tenantId]);

  async function handleCreateStaff() {
    if (!tenantId || !staffForm.name) return;
    setSaving(true);
    await pmsFetch("staff", tenantId, { method: "POST", body: JSON.stringify(staffForm) });
    setSaving(false);
    setStaffOpen(false);
    void load();
  }

  async function handleDeleteStaff(id: string) {
    if (!tenantId) return;
    await pmsFetch(`staff/${id}`, tenantId, { method: "DELETE" });
    void load();
  }

  async function handleCreateInvite() {
    if (!tenantId || !inviteForm.propertyId) return;
    setSaving(true);
    await pmsFetch("staff/invites", tenantId, {
      method: "POST",
      body: JSON.stringify({ propertyId: inviteForm.propertyId, expiresInDays: parseInt(inviteForm.expiresInDays, 10) }),
    });
    setSaving(false);
    setInviteOpen(false);
    void load();
  }

  async function handleRevokeInvite(id: string) {
    if (!tenantId) return;
    await pmsFetch(`staff/invites/${id}/revoke`, tenantId, { method: "POST", body: "{}" });
    void load();
  }

  function copyToken(token: string) {
    void navigator.clipboard.writeText(token);
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  }

  if (!tenantId) {
    return (
      <PmsPageShell title="Staff">
        <p className="text-sm text-muted-foreground">Select a tenant on the Overview page first.</p>
      </PmsPageShell>
    );
  }

  return (
    <PmsPageShell title="Staff" description="Staff roster, property access, and invite management.">
      <Tabs defaultValue="staff">
        <TabsList>
          <TabsTrigger value="staff">Staff</TabsTrigger>
          <TabsTrigger value="managers">Property access</TabsTrigger>
          <TabsTrigger value="invites">Invites</TabsTrigger>
        </TabsList>

        <TabsContent value="staff" className="space-y-4 pt-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setStaffOpen(true)}>
              <PlusIcon className="mr-1 h-4 w-4" /> Add staff
            </Button>
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staff.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">No staff members.</TableCell>
                  </TableRow>
                ) : staff.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="capitalize">{s.role}</TableCell>
                    <TableCell>{s.email ?? "—"}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => void handleDeleteStaff(s.id)}>
                        <TrashIcon className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="managers" className="space-y-4 pt-4">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Property ID</TableHead>
                  <TableHead>Staff ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {managers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground">
                      No property managers. Use invites to delegate access.
                    </TableCell>
                  </TableRow>
                ) : managers.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-mono text-xs">{m.propertyId.slice(0, 8)}…</TableCell>
                    <TableCell className="font-mono text-xs">{m.staffId.slice(0, 8)}…</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="invites" className="space-y-4 pt-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setInviteOpen(true)}>
              <PlusIcon className="mr-1 h-4 w-4" /> Create invite
            </Button>
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Property</TableHead>
                  <TableHead>Token</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invites.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">No invites.</TableCell>
                  </TableRow>
                ) : invites.map((inv) => {
                  const expired = new Date(inv.expiresAt) < new Date();
                  const status = inv.revokedAt ? "revoked" : inv.acceptedAt ? "accepted" : expired ? "expired" : "pending";
                  return (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-xs">{inv.propertyId.slice(0, 8)}…</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-xs">{inv.token.slice(0, 12)}…</span>
                          <Button size="sm" variant="ghost" onClick={() => copyToken(inv.token)}>
                            <CopyIcon className={`h-3 w-3 ${copied === inv.token ? "text-green-600" : ""}`} />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="tabular-nums text-sm">
                        {new Date(inv.expiresAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={status === "accepted" ? "default" : status === "revoked" || status === "expired" ? "destructive" : "secondary"}
                          className="capitalize"
                        >
                          {status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {status === "pending" && (
                          <Button size="sm" variant="outline" onClick={() => void handleRevokeInvite(inv.id)}>
                            Revoke
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={staffOpen} onOpenChange={setStaffOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add staff member</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Full name</Label>
              <Input value={staffForm.name} onChange={(e) => setStaffForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Role</Label>
              <Select value={staffForm.role} onValueChange={(v) => setStaffForm((f) => ({ ...f, role: v ?? "receptionist" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["receptionist", "manager", "housekeeping", "maintenance"].map((r) => (
                    <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Email (optional)</Label>
              <Input type="email" value={staffForm.email} onChange={(e) => setStaffForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStaffOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleCreateStaff()} disabled={saving || !staffForm.name}>
              {saving ? "Saving…" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create property manager invite</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Property UUID</Label>
              <Input value={inviteForm.propertyId} onChange={(e) => setInviteForm((f) => ({ ...f, propertyId: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Expires in (days)</Label>
              <Input type="number" min={1} max={90} value={inviteForm.expiresInDays} onChange={(e) => setInviteForm((f) => ({ ...f, expiresInDays: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleCreateInvite()} disabled={saving || !inviteForm.propertyId}>
              {saving ? "Creating…" : "Create invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PmsPageShell>
  );
}
