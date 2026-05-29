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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePmsTenant } from "@/hooks/use-pms-tenant";
import { pmsFetch } from "@/lib/pms-fetch";

type Task = {
  id: string;
  roomId: string;
  scheduledDate: string;
  status: string;
  cleanerId: string | null;
  notes: string;
};

type Cleaner = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
};

const TASK_COLORS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "secondary",
  in_progress: "default",
  done: "outline",
  skipped: "destructive",
};

export default function PmsCleaningPage() {
  const { tenantId } = usePmsTenant();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [cleaners, setCleaners] = useState<Cleaner[]>([]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [taskOpen, setTaskOpen] = useState(false);
  const [cleanerOpen, setCleanerOpen] = useState(false);
  const [taskSaving, setTaskSaving] = useState(false);
  const [cleanerSaving, setCleanerSaving] = useState(false);
  const [taskForm, setTaskForm] = useState({ roomId: "", scheduledDate: date, notes: "" });
  const [cleanerForm, setCleanerForm] = useState({ name: "", phone: "", email: "" });
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function loadTasks() {
    if (!tenantId) return;
    const res = await pmsFetch(`cleaning/tasks?date=${date}`, tenantId);
    setTasks(((await res.json()) as { tasks?: Task[] }).tasks ?? []);
  }

  async function loadCleaners() {
    if (!tenantId) return;
    const res = await pmsFetch("cleaning/cleaners", tenantId);
    setCleaners(((await res.json()) as { cleaners?: Cleaner[] }).cleaners ?? []);
  }

  useEffect(() => { void loadTasks(); void loadCleaners(); }, [tenantId, date]);

  async function updateTaskStatus(id: string, status: string) {
    if (!tenantId) return;
    setUpdatingId(id);
    await pmsFetch(`cleaning/tasks/${id}`, tenantId, { method: "PATCH", body: JSON.stringify({ status }) });
    setUpdatingId(null);
    void loadTasks();
  }

  async function handleCreateTask() {
    if (!tenantId || !taskForm.roomId) return;
    setTaskSaving(true);
    await pmsFetch("cleaning/tasks", tenantId, { method: "POST", body: JSON.stringify({ ...taskForm, scheduledDate: date }) });
    setTaskSaving(false);
    setTaskOpen(false);
    void loadTasks();
  }

  async function handleCreateCleaner() {
    if (!tenantId || !cleanerForm.name) return;
    setCleanerSaving(true);
    await pmsFetch("cleaning/cleaners", tenantId, { method: "POST", body: JSON.stringify(cleanerForm) });
    setCleanerSaving(false);
    setCleanerOpen(false);
    void loadCleaners();
  }

  if (!tenantId) {
    return (
      <PmsPageShell title="Cleaning">
        <p className="text-sm text-muted-foreground">Select a tenant on the Overview page first.</p>
      </PmsPageShell>
    );
  }

  return (
    <PmsPageShell title="Cleaning" description="Daily task board and cleaner roster.">
      <Tabs defaultValue="tasks">
        <TabsList>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="cleaners">Cleaners</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="space-y-4 pt-4">
          <div className="flex items-center gap-3">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-[180px]"
            />
            <Button size="sm" className="ml-auto" onClick={() => setTaskOpen(true)}>
              <PlusIcon className="mr-1 h-4 w-4" /> Add task
            </Button>
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Room ID</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No tasks for this date.
                    </TableCell>
                  </TableRow>
                ) : (
                  tasks.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono text-xs">{t.roomId.slice(0, 8)}…</TableCell>
                      <TableCell>{t.scheduledDate}</TableCell>
                      <TableCell>{t.notes || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={TASK_COLORS[t.status] ?? "outline"} className="capitalize">
                          {t.status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {t.status === "pending" && (
                          <Button size="sm" variant="outline" disabled={updatingId === t.id} onClick={() => void updateTaskStatus(t.id, "in_progress")}>
                            Start
                          </Button>
                        )}
                        {t.status === "in_progress" && (
                          <Button size="sm" disabled={updatingId === t.id} onClick={() => void updateTaskStatus(t.id, "done")}>
                            Done
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="cleaners" className="space-y-4 pt-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setCleanerOpen(true)}>
              <PlusIcon className="mr-1 h-4 w-4" /> Add cleaner
            </Button>
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cleaners.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      No cleaners yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  cleaners.map((cl) => (
                    <TableRow key={cl.id}>
                      <TableCell className="font-medium">{cl.name}</TableCell>
                      <TableCell>{cl.phone ?? "—"}</TableCell>
                      <TableCell>{cl.email ?? "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add cleaning task</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Room UUID</Label>
              <Input value={taskForm.roomId} onChange={(e) => setTaskForm((f) => ({ ...f, roomId: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Input value={taskForm.notes} onChange={(e) => setTaskForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTaskOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleCreateTask()} disabled={taskSaving || !taskForm.roomId}>
              {taskSaving ? "Saving…" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cleanerOpen} onOpenChange={setCleanerOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add cleaner</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {([["name", "Full name"], ["phone", "Phone"], ["email", "Email"]] as const).map(([f, l]) => (
              <div key={f} className="space-y-1">
                <Label>{l}</Label>
                <Input value={cleanerForm[f]} onChange={(e) => setCleanerForm((cf) => ({ ...cf, [f]: e.target.value }))} />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCleanerOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleCreateCleaner()} disabled={cleanerSaving || !cleanerForm.name}>
              {cleanerSaving ? "Saving…" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PmsPageShell>
  );
}
