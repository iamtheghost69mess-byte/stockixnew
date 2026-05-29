"use client";

import { useState } from "react";

import Link from "next/link";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertCircle, ArrowRight, ClipboardCheck, EyeOff, History, Loader2, Plus } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchLocationsList, normalizeLocationsQueryData } from "@/lib/inventory-api";
import { posCreateStockTakeSession, posListStockTakeSessions } from "@/lib/pos-stock-take-api";
import { type StockTakeSessionFormData, stockTakeSessionSchema } from "@/lib/schemas/stock-take";

function accessHint(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : String(err);
  if (/403|do not have permission|permission to view inventory/i.test(msg)) {
    return "You need a role with inventory access (e.g. manager or admin).";
  }
  return null;
}

export default function StockTakeListPage() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // 1. Fetch Data
  const {
    data: sessionsRes,
    isLoading: isLoadingSessions,
    isError: sessionsError,
    error: sessionsErr,
  } = useQuery({
    queryKey: ["stock-take-sessions"],
    queryFn: () => posListStockTakeSessions(),
  });
  const sessions = Array.isArray(sessionsRes?.data) ? sessionsRes.data : [];

  const {
    data: locationsRaw,
    isError: locationsError,
    error: locationsErr,
  } = useQuery({
    queryKey: ["locations"],
    queryFn: fetchLocationsList,
  });
  const locations = normalizeLocationsQueryData(locationsRaw);

  // 2. Mutations
  const createMutation = useMutation({
    mutationFn: posCreateStockTakeSession,
    onSuccess: (_res) => {
      queryClient.invalidateQueries({ queryKey: ["stock-take-sessions"] });
      toast.success("Stock take session initialized.");
      setIsDialogOpen(false);
      // Optional: push to the session detail page
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to create session.";
      const hint = accessHint(err);
      toast.error(hint ? `${msg} ${hint}` : msg);
    },
  });

  // 3. Form Setup
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    reset,
  } = useForm<StockTakeSessionFormData>({
    resolver: zodResolver(stockTakeSessionSchema),
    defaultValues: {
      locationId: "",
      note: "",
      blindCount: false,
      countMethod: "full",
    },
  });

  const onSubmit = (data: StockTakeSessionFormData) => {
    createMutation.mutate(data);
  };

  const listLoadError = sessionsError ? sessionsErr : null;
  const locationsLoadError = locationsError ? locationsErr : null;
  const canStartSession = !locationsError && locations.length > 0 && !sessionsError;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-3xl tracking-tight">Stock Counting (Stock Take)</h1>
          <p className="text-muted-foreground">Perform physical inventory audits and reconcile system stock levels.</p>
        </div>
        <Button
          onClick={() => setIsDialogOpen(true)}
          className="gap-2"
          disabled={!canStartSession || createMutation.isPending}
          title={
            !canStartSession
              ? locations.length === 0
                ? "Create a location first, then start a stock take."
                : "Cannot start a session while data is unavailable."
              : undefined
          }
        >
          <Plus className="h-4 w-4" /> Start counter
        </Button>
      </div>

      {listLoadError ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Could not load stock take sessions</AlertTitle>
          <AlertDescription>
            {listLoadError instanceof Error ? listLoadError.message : "Request failed."}
            {accessHint(listLoadError) ? ` ${accessHint(listLoadError)}` : ""}
          </AlertDescription>
        </Alert>
      ) : null}

      {locationsLoadError ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Could not load locations</AlertTitle>
          <AlertDescription>
            {locationsLoadError instanceof Error ? locationsLoadError.message : "Request failed."}
            {accessHint(locationsLoadError) ? ` ${accessHint(locationsLoadError)}` : ""}
          </AlertDescription>
        </Alert>
      ) : locations.length === 0 && !isLoadingSessions ? (
        <Alert>
          <AlertCircle className="size-4" />
          <AlertTitle>No branch locations</AlertTitle>
          <AlertDescription>
            Add at least one location under{" "}
            <Link href="/dashboard/locations" className="font-medium text-primary underline-offset-4 hover:underline">
              Locations
            </Link>{" "}
            before starting a stock take.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardDescription className="font-bold text-xs uppercase">Active Sessions</CardDescription>
            <CardTitle className="text-2xl">{sessions.filter((s) => s.status === "in_progress").length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="font-bold text-xs uppercase">Total Audits</CardDescription>
            <CardTitle className="text-2xl">{sessions.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Audit History</CardTitle>
            <CardDescription>Recently performed and ongoing stock counting sessions.</CardDescription>
          </div>
          <History className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Location</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Lines</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingSessions ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-32" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-12" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="ml-auto h-8 w-20" />
                    </TableCell>
                  </TableRow>
                ))
              ) : sessions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="p-0">
                    <div className="flex justify-center py-12">
                      <Empty>
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <ClipboardCheck />
                          </EmptyMedia>
                          <EmptyTitle>No sessions yet</EmptyTitle>
                          <EmptyDescription>
                            Start a counter to snapshot system quantities and enter physical counts for a branch.
                          </EmptyDescription>
                        </EmptyHeader>
                        <Button
                          type="button"
                          className="mt-4"
                          disabled={!canStartSession}
                          onClick={() => setIsDialogOpen(true)}
                        >
                          <Plus className="mr-2 size-4" />
                          Start first session
                        </Button>
                      </Empty>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                sessions.map((session) => (
                  <TableRow key={session._id}>
                    <TableCell>
                      <div className="font-medium">{(session.location as any).name || "Unknown"}</div>
                      <div className="font-mono text-muted-foreground text-xs">
                        {(session.location as any).code || "N/A"}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {format(new Date(session.createdAt), "MMM d, yyyy HH:mm")}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Badge variant={session.status === "posted" ? "secondary" : "default"}>
                          {session.status === "posted" ? "Finalized" : "Counting"}
                        </Badge>
                        {session.blindCount && (
                          <Badge variant="outline" className="gap-1 bg-amber-500/10 text-amber-600">
                            <EyeOff className="size-3" /> Blind
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{session.lines.length} items</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/dashboard/inventory/stock-take/${session._id}`}>
                          {session.status === "posted" ? "View Details" : "Continue Count"}
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            reset({ locationId: "", note: "", blindCount: false, countMethod: "full" });
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Stock Take Session</DialogTitle>
            <DialogDescription>
              Select a location to start an inventory audit. System will snapshot current stock levels.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="stloc">Inventory Location</Label>
              <Controller
                control={control}
                name="locationId"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value} disabled={locations.length === 0}>
                    <SelectTrigger id="stloc">
                      <SelectValue
                        placeholder={locations.length === 0 ? "Add a location first…" : "Select location…"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map((loc) => (
                        <SelectItem key={loc._id} value={loc._id}>
                          {loc.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.locationId && <p className="text-destructive text-xs">{errors.locationId.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="stnote">Audit Note (Optional)</Label>
              <Input id="stnote" {...register("note")} placeholder="e.g. End of month audit" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="st-count-method">Count scope</Label>
              <Controller
                control={control}
                name="countMethod"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger id="st-count-method">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full">Full — all active ingredients</SelectItem>
                      <SelectItem value="cycle">Cycle / spot — balances at this branch only</SelectItem>
                      <SelectItem value="spot">Spot (same seeding as cycle)</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="text-[12px] text-muted-foreground">
                Cycle/spot reduce line count to ingredients that already have a stock balance row at the selected
                location.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label className="text-sm">Blind Count</Label>
                <p className="text-[12px] text-muted-foreground">
                  Hide system quantities from counters until finalized.
                </p>
              </div>
              <Controller
                control={control}
                name="blindCount"
                render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
              />
            </div>

            <DialogFooter className="border-t pt-4">
              <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Start Session
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
