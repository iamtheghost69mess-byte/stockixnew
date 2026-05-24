"use client";

import { useEffect, useState } from "react";

import { PlusIcon, RefreshCwIcon } from "lucide-react";

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

type Channel = {
  id: string;
  name: string;
  platform: string;
  propertyId: string;
  importUrl: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  failureCount: number;
  bufferBefore: number;
  bufferAfter: number;
};

type SyncLog = { id: string; level: string; message: string; createdAt: string };

export default function PmsChannelsPage() {
  const { tenantId } = usePmsTenant();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    propertyId: "", name: "", platform: "other",
    importUrl: "", bufferBefore: "1", bufferAfter: "1",
  });

  async function load() {
    if (!tenantId) return;
    const [chRes, logRes] = await Promise.all([
      pmsFetch("channels", tenantId),
      pmsFetch("channels/logs?limit=20", tenantId),
    ]);
    setChannels(((await chRes.json()) as { channels?: Channel[] }).channels ?? []);
    setLogs(((await logRes.json()) as { logs?: SyncLog[] }).logs ?? []);
  }

  useEffect(() => { void load(); }, [tenantId]);

  async function handleSync() {
    if (!tenantId) return;
    setSyncing(true);
    await pmsFetch("channels/sync", tenantId, { method: "POST", body: "{}" });
    setSyncing(false);
    void load();
  }

  async function handleCreate() {
    if (!tenantId || !form.propertyId || !form.name) return;
    setSaving(true);
    await pmsFetch("channels", tenantId, {
      method: "POST",
      body: JSON.stringify({
        ...form,
        bufferBefore: parseInt(form.bufferBefore, 10),
        bufferAfter: parseInt(form.bufferAfter, 10),
      }),
    });
    setSaving(false);
    setOpen(false);
    void load();
  }

  const LOG_COLORS: Record<string, string> = {
    error: "text-destructive",
    warn: "text-yellow-600",
    success: "text-green-600",
    info: "text-muted-foreground",
  };

  if (!tenantId) {
    return (
      <PmsPageShell title="iCal Channels">
        <p className="text-sm text-muted-foreground">Select a tenant on the Overview page first.</p>
      </PmsPageShell>
    );
  }

  return (
    <PmsPageShell title="iCal Channels" description="OTA channel connections and sync audit logs.">
      <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" onClick={() => void handleSync()} disabled={syncing}>
          <RefreshCwIcon className={`mr-1 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing…" : "Sync now"}
        </Button>
        <Button size="sm" className="ml-auto" onClick={() => setOpen(true)}>
          <PlusIcon className="mr-1 h-4 w-4" /> Add channel
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Platform</TableHead>
              <TableHead>Buffers</TableHead>
              <TableHead>Last synced</TableHead>
              <TableHead>Failures</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {channels.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No channels configured.
                </TableCell>
              </TableRow>
            ) : (
              channels.map((ch) => (
                <TableRow key={ch.id}>
                  <TableCell className="font-medium">{ch.name}</TableCell>
                  <TableCell className="capitalize">{ch.platform}</TableCell>
                  <TableCell className="tabular-nums text-sm">-{ch.bufferBefore} / +{ch.bufferAfter} d</TableCell>
                  <TableCell className="tabular-nums text-sm">
                    {ch.lastSyncedAt ? new Date(ch.lastSyncedAt).toLocaleString() : "Never"}
                  </TableCell>
                  <TableCell>
                    {ch.failureCount > 0 ? (
                      <Badge variant="destructive">{ch.failureCount}</Badge>
                    ) : <span className="text-muted-foreground">0</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={ch.lastError ? "destructive" : "default"}>
                      {ch.lastError ? "Error" : "OK"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {logs.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">Recent sync logs</p>
          <div className="max-h-56 overflow-y-auto rounded-lg border bg-muted/30 p-3 font-mono text-xs">
            {logs.map((l) => (
              <div key={l.id} className={`leading-5 ${LOG_COLORS[l.level] ?? ""}`}>
                <span className="mr-2 opacity-60">{new Date(l.createdAt).toLocaleTimeString()}</span>
                {l.message}
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add iCal channel</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Property UUID</Label>
                <Input value={form.propertyId} onChange={(e) => setForm((f) => ({ ...f, propertyId: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Platform</Label>
              <Select value={form.platform} onValueChange={(v) => setForm((f) => ({ ...f, platform: v ?? "other" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["airbnb", "booking", "vrbo", "expedia", "direct", "other"].map((p) => (
                    <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Import URL (iCal feed)</Label>
              <Input value={form.importUrl} onChange={(e) => setForm((f) => ({ ...f, importUrl: e.target.value }))} placeholder="https://…" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Buffer before (days)</Label>
                <Input type="number" min={0} value={form.bufferBefore} onChange={(e) => setForm((f) => ({ ...f, bufferBefore: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Buffer after (days)</Label>
                <Input type="number" min={0} value={form.bufferAfter} onChange={(e) => setForm((f) => ({ ...f, bufferAfter: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleCreate()} disabled={saving || !form.name || !form.propertyId}>
              {saving ? "Saving…" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PmsPageShell>
  );
}
