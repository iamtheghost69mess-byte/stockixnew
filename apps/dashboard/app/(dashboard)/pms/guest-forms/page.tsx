"use client";

import { useEffect, useState } from "react";

import { ClipboardCopyIcon, PlusIcon, SendIcon, TrashIcon } from "lucide-react";

import { PmsPageShell } from "@/components/pms-page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

type FieldDef = { id: string; type: string; label: string; required: boolean };

type Template = {
  id: string;
  name: string;
  propertyId: string | null;
  fields: string;
};

type Submission = {
  id: string;
  shareToken: string;
  submittedAt: string | null;
  answers: string | null;
};

const FIELD_TYPES = ["text", "textarea", "select", "checkbox", "date", "phone", "email"] as const;

function parseFields(raw: string): FieldDef[] {
  try {
    return JSON.parse(raw) as FieldDef[];
  } catch {
    return [];
  }
}

export default function PmsGuestFormsPage() {
  const { tenantId } = usePmsTenant();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [templateForm, setTemplateForm] = useState({ name: "", propertyId: "" });
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [newField, setNewField] = useState<FieldDef>({
    id: "", type: "text", label: "", required: false,
  });

  const [bookingId, setBookingId] = useState("");
  const [submission, setSubmission] = useState<Submission | null | undefined>(undefined);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function loadTemplates() {
    if (!tenantId) return;
    const res = await pmsFetch("guest-forms", tenantId);
    setTemplates(((await res.json()) as { templates?: Template[] }).templates ?? []);
  }

  useEffect(() => { void loadTemplates(); }, [tenantId]);

  function addField() {
    const id = newField.id.trim() || newField.label.toLowerCase().replace(/\s+/g, "_") || `field_${fields.length + 1}`;
    setFields((prev) => [...prev, { ...newField, id }]);
    setNewField({ id: "", type: "text", label: "", required: false });
  }

  function removeField(idx: number) {
    setFields((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleCreateTemplate() {
    if (!tenantId || !templateForm.name) return;
    setSaving(true);
    await pmsFetch("guest-forms", tenantId, {
      method: "POST",
      body: JSON.stringify({
        name: templateForm.name,
        ...(templateForm.propertyId ? { propertyId: templateForm.propertyId } : {}),
        fields: JSON.stringify(fields),
      }),
    });
    setSaving(false);
    setTemplateOpen(false);
    setTemplateForm({ name: "", propertyId: "" });
    setFields([]);
    void loadTemplates();
  }

  async function handleDeleteTemplate(id: string) {
    if (!tenantId) return;
    await pmsFetch(`guest-forms/${id}`, tenantId, { method: "DELETE" });
    void loadTemplates();
  }

  async function handleLookup() {
    if (!tenantId || !bookingId.trim()) return;
    setLookupLoading(true);
    setSubmission(undefined);
    setShareToken(null);
    const res = await pmsFetch(`guest-forms/booking/${bookingId.trim()}`, tenantId);
    if (!res.ok) {
      setSubmission(null);
    } else {
      const data = (await res.json()) as { submission: Submission | null };
      setSubmission(data.submission);
      setShareToken(data.submission?.shareToken ?? null);
    }
    setLookupLoading(false);
  }

  async function handleGenerateLink() {
    if (!tenantId || !bookingId.trim()) return;
    setShareLoading(true);
    const res = await pmsFetch(`guest-forms/booking/${bookingId.trim()}/share`, tenantId, {
      method: "POST",
      body: "{}",
    });
    if (res.ok) {
      const data = (await res.json()) as { shareToken?: string };
      if (data.shareToken) setShareToken(data.shareToken);
      void handleLookup();
    }
    setShareLoading(false);
  }

  function guestFormUrl(token: string): string {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return `${base}/g/${token}`;
  }

  function copyLink() {
    if (!shareToken) return;
    void navigator.clipboard.writeText(guestFormUrl(shareToken));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!tenantId) {
    return (
      <PmsPageShell title="Guest Forms">
        <p className="text-sm text-muted-foreground">Select a tenant on the Overview page first.</p>
      </PmsPageShell>
    );
  }

  return (
    <PmsPageShell title="Guest Forms" description="Pre-arrival guest form templates and share links.">
      <Tabs defaultValue="templates">
        <TabsList>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="lookup">Booking lookup</TabsTrigger>
        </TabsList>

        {/* ── Templates tab ── */}
        <TabsContent value="templates" className="space-y-4 pt-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setTemplateOpen(true)}>
              <PlusIcon className="mr-1 h-4 w-4" /> New template
            </Button>
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Property</TableHead>
                  <TableHead>Fields</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No templates yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  templates.map((t) => {
                    const fieldList = parseFields(t.fields);
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">{t.name}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {t.propertyId ? `${t.propertyId.slice(0, 8)}…` : "All properties"}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {fieldList.length === 0
                              ? <span className="text-muted-foreground text-xs">No fields</span>
                              : fieldList.map((f) => (
                                <Badge key={f.id} variant="outline" className="text-xs">
                                  {f.label || f.id}
                                  {f.required ? " *" : ""}
                                </Badge>
                              ))
                            }
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void handleDeleteTemplate(t.id)}
                          >
                            <TrashIcon className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Booking lookup tab ── */}
        <TabsContent value="lookup" className="space-y-4 pt-4">
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1">
              <Label>Booking UUID</Label>
              <Input
                value={bookingId}
                onChange={(e) => setBookingId(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              />
            </div>
            <Button onClick={() => void handleLookup()} disabled={lookupLoading || !bookingId.trim()}>
              {lookupLoading ? "Looking up…" : "Look up"}
            </Button>
          </div>

          {submission === undefined ? null : submission === null ? (
            <p className="text-sm text-muted-foreground">Booking not found or no template configured for this property.</p>
          ) : (
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Submission status</p>
                  <Badge
                    variant={submission.submittedAt ? "default" : "secondary"}
                    className="mt-1"
                  >
                    {submission.submittedAt ? `Submitted ${new Date(submission.submittedAt).toLocaleDateString()}` : "Pending"}
                  </Badge>
                </div>
                {shareToken ? (
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      /g/{shareToken.slice(0, 12)}…
                    </span>
                    <Button size="sm" variant="outline" onClick={copyLink}>
                      <ClipboardCopyIcon className={`mr-1 h-4 w-4 ${copied ? "text-green-600" : ""}`} />
                      {copied ? "Copied!" : "Copy link"}
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" onClick={() => void handleGenerateLink()} disabled={shareLoading}>
                    <SendIcon className="mr-1 h-4 w-4" />
                    {shareLoading ? "Generating…" : "Generate share link"}
                  </Button>
                )}
              </div>

              {submission.submittedAt && submission.answers ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Answers</p>
                  <div className="rounded-md bg-muted/40 p-3 text-sm space-y-1">
                    {(() => {
                      try {
                        const answers = JSON.parse(submission.answers) as Array<{
                          fieldId: string;
                          label: string;
                          value: unknown;
                        }>;
                        return answers.map((a) => (
                          <div key={a.fieldId} className="flex gap-2">
                            <span className="font-medium min-w-[140px]">{a.label || a.fieldId}:</span>
                            <span className="text-muted-foreground">{String(a.value ?? "—")}</span>
                          </div>
                        ));
                      } catch {
                        return <span className="text-muted-foreground">Could not parse answers.</span>;
                      }
                    })()}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Create template dialog ── */}
      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New guest form template</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Template name</Label>
              <Input
                value={templateForm.name}
                onChange={(e) => setTemplateForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Pre-arrival form"
              />
            </div>
            <div className="space-y-1">
              <Label>Property UUID (optional — leave blank for all properties)</Label>
              <Input
                value={templateForm.propertyId}
                onChange={(e) => setTemplateForm((f) => ({ ...f, propertyId: e.target.value }))}
                placeholder="xxxxxxxx-xxxx-…"
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Fields</p>
              {fields.length > 0 && (
                <div className="rounded-md border divide-y">
                  {fields.map((f, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span>
                        <span className="font-medium">{f.label || f.id}</span>
                        <span className="ml-2 text-xs text-muted-foreground">({f.type})</span>
                        {f.required && <span className="ml-1 text-destructive text-xs">*required</span>}
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => removeField(i)}>
                        <TrashIcon className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-md border p-3 space-y-2 bg-muted/30">
                <p className="text-xs font-medium text-muted-foreground">Add field</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Label</Label>
                    <Input
                      className="h-8 text-sm"
                      value={newField.label}
                      onChange={(e) => setNewField((f) => ({ ...f, label: e.target.value }))}
                      placeholder="Full name"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Type</Label>
                    <Select value={newField.type} onValueChange={(v) => setNewField((f) => ({ ...f, type: v ?? "text" }))}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FIELD_TYPES.map((t) => (
                          <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="space-y-1 flex-1">
                    <Label className="text-xs">Field ID (auto from label)</Label>
                    <Input
                      className="h-8 text-sm"
                      value={newField.id}
                      onChange={(e) => setNewField((f) => ({ ...f, id: e.target.value }))}
                      placeholder="full_name"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-4">
                    <Checkbox
                      id="req"
                      checked={newField.required}
                      onCheckedChange={(v) => setNewField((f) => ({ ...f, required: !!v }))}
                    />
                    <Label htmlFor="req" className="text-xs cursor-pointer">Required</Label>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={addField}
                  disabled={!newField.label}
                >
                  <PlusIcon className="mr-1 h-3.5 w-3.5" /> Add field
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateOpen(false)}>Cancel</Button>
            <Button
              onClick={() => void handleCreateTemplate()}
              disabled={saving || !templateForm.name}
            >
              {saving ? "Saving…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PmsPageShell>
  );
}
