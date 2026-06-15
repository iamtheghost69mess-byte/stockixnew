"use client";

import { useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { AccessGate } from "@/components/access-gate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  createWastageEntry,
  fetchIngredients,
  fetchWastageEntries,
  fetchWastageReport,
  INGREDIENTS_QUERY_KEY,
  invalidateInventoryHubQueries,
  type IngredientRecord,
  type WastageReason,
} from "@/lib/inventory-api";
import { exportReportExcel } from "@/lib/reports/export-excel";
import { exportReportPdf } from "@/lib/reports/export-pdf";

const WASTAGE_REASONS: WastageReason[] = [
  "spoilage",
  "accident",
  "staff_meal",
  "other",
];

export default function InventoryWastagePage() {
  const queryClient = useQueryClient();
  const [ingredientId, setIngredientId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState<WastageReason>("spoilage");
  const [notes, setNotes] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const ingredientsQuery = useQuery({
    queryKey: [...INGREDIENTS_QUERY_KEY, "wastage", "active"],
    queryFn: async () => {
      const res = await fetchIngredients({ status: "active" });
      return Array.isArray(res.data) ? (res.data as IngredientRecord[]) : [];
    },
  });

  const wastageQuery = useQuery({
    queryKey: ["inventory-wastage-entries", from, to],
    queryFn: async () => {
      const res = await fetchWastageEntries({ page: 1, limit: 100, from: from || undefined, to: to || undefined });
      return Array.isArray(res.data) ? res.data : [];
    },
  });

  const wastageReportQuery = useQuery({
    queryKey: ["inventory-wastage-report", from, to],
    queryFn: async () => {
      const res = await fetchWastageReport({ from: from || undefined, to: to || undefined });
      return Array.isArray(res.data) ? res.data : [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const qty = Number(quantity);
      if (!ingredientId) throw new Error("Select an ingredient.");
      if (!Number.isFinite(qty) || qty <= 0) throw new Error("Quantity must be a positive number.");
      return createWastageEntry({
        ingredientId,
        quantity: qty,
        reason,
        notes: notes.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success("Wastage entry recorded.");
      setQuantity("");
      setNotes("");
      invalidateInventoryHubQueries(queryClient);
      void queryClient.invalidateQueries({ queryKey: ["inventory-wastage-entries"] });
      void queryClient.invalidateQueries({ queryKey: ["inventory-wastage-report"] });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Failed to save wastage entry.");
    },
  });

  return (
    <AccessGate permission="backoffice.inventory.read">
      <div className="space-y-6">
        <div>
          <h1 className="font-semibold text-3xl tracking-tight">Wastage</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Record ingredient wastage with reason, then review totals grouped by reason.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>New wastage entry</CardTitle>
            <CardDescription>
              Saves a dedicated wastage record, decrements stock, and creates a stock movement.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Ingredient</Label>
              <Select value={ingredientId || undefined} onValueChange={setIngredientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select ingredient" />
                </SelectTrigger>
                <SelectContent>
                  {(ingredientsQuery.data || []).map((ing) => (
                    <SelectItem key={ing._id} value={ing._id}>
                      {ing.name || ing.sku || ing._id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="wastage-qty">Quantity</Label>
              <Input
                id="wastage-qty"
                type="number"
                min={0}
                step="any"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                placeholder="e.g. 2"
              />
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Select value={reason} onValueChange={(value) => setReason(value as WastageReason)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WASTAGE_REASONS.map((entry) => (
                    <SelectItem key={entry} value={entry}>
                      {entry}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="wastage-notes">Notes</Label>
              <Input
                id="wastage-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Optional details..."
              />
            </div>
            <div className="md:col-span-2">
              <Button disabled={createMutation.isPending} onClick={() => void createMutation.mutateAsync()}>
                {createMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Save wastage
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 md:flex-row">
            <div className="space-y-2">
              <Label>From</Label>
              <DatePicker value={from} onValueChange={setFrom} className="w-full min-w-[220px]" />
            </div>
            <div className="space-y-2">
              <Label>To</Label>
              <DatePicker value={to} onValueChange={setTo} className="w-full min-w-[220px]" />
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1"
            disabled={!(wastageReportQuery.data || []).length}
            onClick={() => {
              const rows = (wastageReportQuery.data || []).map((row) => ({
                reason: row.reason,
                entries: row.entryCount,
                quantity: row.totalQuantity,
                cost: row.totalWasteCost,
              }));
              exportReportPdf({
                fileName: "inventory-wastage-by-reason.pdf",
                title: "Wastage by reason",
                branchName: "Inventory",
                dateRange: `${from || "…"} → ${to || "…"}`,
                columns: [
                  { key: "reason", label: "Reason" },
                  { key: "entries", label: "Entries" },
                  { key: "quantity", label: "Quantity" },
                  { key: "cost", label: "Total cost" },
                ],
                rows,
              });
            }}
          >
            <Download className="size-4" />
            PDF (by reason)
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1"
            disabled={!(wastageQuery.data || []).length}
            onClick={() => {
              const rows = (wastageQuery.data || []).map((row) => ({
                date: row.createdAt ? format(new Date(row.createdAt), "yyyy-MM-dd HH:mm") : "—",
                ingredient: row.ingredient?.name ?? "—",
                reason: row.reason,
                quantity: String(Number(row.quantity || 0)),
                unitCost: String(Number(row.unitCostAtEntry || 0)),
                totalCost: String(Number(row.totalCost || 0)),
              }));
              exportReportPdf({
                fileName: "inventory-wastage-entries.pdf",
                title: "Wastage entries",
                branchName: "Inventory",
                dateRange: `${from || "…"} → ${to || "…"}`,
                columns: [
                  { key: "date", label: "Date" },
                  { key: "ingredient", label: "Ingredient" },
                  { key: "reason", label: "Reason" },
                  { key: "quantity", label: "Qty" },
                  { key: "unitCost", label: "Unit cost" },
                  { key: "totalCost", label: "Total cost" },
                ],
                rows,
              });
            }}
          >
            <Download className="size-4" />
            PDF (entries)
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1"
            disabled={!(wastageQuery.data || []).length}
            onClick={() => {
              const rows = (wastageQuery.data || []).map((row) => ({
                date: row.createdAt ? format(new Date(row.createdAt), "yyyy-MM-dd HH:mm") : "—",
                ingredient: row.ingredient?.name ?? "—",
                reason: row.reason,
                quantity: Number(row.quantity || 0),
                unitCost: Number(row.unitCostAtEntry || 0),
                totalCost: Number(row.totalCost || 0),
              }));
              exportReportExcel({
                fileName: "inventory-wastage-entries.xlsx",
                branchName: "Inventory",
                dateRange: `${from || "…"} → ${to || "…"}`,
                columns: [
                  { key: "date", label: "Date" },
                  { key: "ingredient", label: "Ingredient" },
                  { key: "reason", label: "Reason" },
                  { key: "quantity", label: "Quantity" },
                  { key: "unitCost", label: "Unit cost" },
                  { key: "totalCost", label: "Total cost" },
                ],
                rows,
              });
            }}
          >
            <FileSpreadsheet className="size-4" />
            Excel (entries)
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Wastage cost by reason</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Entries</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Total cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(wastageReportQuery.data || []).map((row) => (
                  <TableRow key={row.reason}>
                    <TableCell>{row.reason}</TableCell>
                    <TableCell className="text-right">{row.entryCount}</TableCell>
                    <TableCell className="text-right">{row.totalQuantity.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{row.totalWasteCost.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Wastage entries</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Ingredient</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Unit cost</TableHead>
                  <TableHead className="text-right">Total cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(wastageQuery.data || []).map((row) => (
                  <TableRow key={row._id}>
                    <TableCell>{row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}</TableCell>
                    <TableCell>{row.ingredient?.name || "—"}</TableCell>
                    <TableCell>{row.reason}</TableCell>
                    <TableCell className="text-right">{Number(row.quantity || 0).toFixed(2)}</TableCell>
                    <TableCell className="text-right">{Number(row.unitCostAtEntry || 0).toFixed(2)}</TableCell>
                    <TableCell className="text-right">{Number(row.totalCost || 0).toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AccessGate>
  );
}
