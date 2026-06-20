"use client";

import { useEffect, useState } from "react";

import { PlusIcon, TrashIcon } from "lucide-react";

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

type Template = {
  id: string;
  name: string;
  channel: string;
  trigger: string;
  subject: string;
  sendOffsetDays: number;
};

export default function PmsMessageTemplatesPage() {
  const { tenantId } = usePmsTenant();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", channel: "email", trigger: "pre_arrival",
    subject: "", body: "", sendOffsetDays: "-1",
  });

  async function load() {
    if (!tenantId) return;
    const res = await pmsFetch("message-templates", tenantId);
    setTemplates(((await res.json()) as { templates?: Template[] }).templates ?? []);
  }

  useEffect(() => { void load(); }, [tenantId]);

  async function handleCreate() {
    if (!tenantId || !form.name || !form.body) return;
    setSaving(true);
    await pmsFetch("message-templates", tenantId, {
      method: "POST",
      body: JSON.stringify({ ...form, sendOffsetDays: parseInt(form.sendOffsetDays, 10) }),
    });
    setSaving(false);
    setOpen(false);
    void load();
  }

  async function handleDelete(id: string) {
    if (!tenantId) return;
    await pmsFetch(`message-templates/${id}`, tenantId, { method: "DELETE" });
    void load();
  }

  if (!tenantId) {
    return (
      <PmsPageShell title="Message Templates">
        <p className="text-sm text-muted-foreground">Select a tenant on the Overview page first.</p>
      </PmsPageShell>
    );
  }

  return (
    <PmsPageShell title="Message Templates" description="Automated guest communication templates.">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen(true)}>
          <PlusIcon className="mr-1 h-4 w-4" /> New template
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Trigger</TableHead>
              <TableHead>Offset</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No templates.
                </TableCell>
              </TableRow>
            ) : (
              templates.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">{t.channel}</Badge>
                  </TableCell>
                  <TableCell className="capitalize">{t.trigger.replace("_", " ")}</TableCell>
                  <TableCell className="tabular-nums">
                    {t.sendOffsetDays > 0 ? `+${t.sendOffsetDays}d` : t.sendOffsetDays < 0 ? `${t.sendOffsetDays}d` : "Same day"}
                  </TableCell>
                  <TableCell>{t.subject || "—"}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => void handleDelete(t.id)}>
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
          <DialogHeader><DialogTitle>New message template</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Channel</Label>
                <Select value={form.channel} onValueChange={(v) => setForm((f) => ({ ...f, channel: v ?? "email" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["email", "sms", "whatsapp"].map((ch) => (
                      <SelectItem key={ch} value={ch} className="capitalize">{ch}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Trigger</Label>
                <Select value={form.trigger} onValueChange={(v) => setForm((f) => ({ ...f, trigger: v ?? "custom" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["pre_arrival", "check_in", "check_out", "post_stay", "custom"].map((tr) => (
                      <SelectItem key={tr} value={tr} className="capitalize">{tr.replace("_", " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Subject</Label>
                <Input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Offset (days, negative = before)</Label>
                <Input type="number" value={form.sendOffsetDays} onChange={(e) => setForm((f) => ({ ...f, sendOffsetDays: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Body</Label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border px-3 py-2 text-sm"
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                placeholder="Message body with {{guest_name}}, {{check_in}}, etc."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleCreate()} disabled={saving || !form.name || !form.body}>
              {saving ? "Saving…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PmsPageShell>
  );
}
