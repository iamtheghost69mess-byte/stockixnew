"use client";

import { useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPosMutationError } from "@/lib/format-pos-api-error";
import {
  type IngredientSupplierLinkRow,
  ingredientSupplierLinksQueryKey,
  posDeleteIngredientSupplierLink,
  posFetchIngredientSupplierLinks,
  posUpsertIngredientSupplierLink,
} from "@/lib/pos-ingredient-suppliers-api";
import { posFetchSuppliers } from "@/lib/pos-procurement-api";
import { fieldErrorsFromZodError } from "@/lib/schemas/accounting/zod-field-errors";
import { ingredientSupplierLinkUpsertSchema } from "@/lib/schemas/ingredient-supplier-link";
import { formatCurrency } from "@/lib/utils";

function supplierName(row: IngredientSupplierLinkRow) {
  const s = row.supplier;
  if (typeof s === "object" && s?.name) return s.name;
  return "—";
}

function supplierIdOf(row: IngredientSupplierLinkRow): string {
  const s = row.supplier;
  if (typeof s === "string") return s;
  return String(s?._id || "");
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ingredientId: string;
  ingredientName: string;
};

export function IngredientSupplierLinksDialog({ open, onOpenChange, ingredientId, ingredientName }: Props) {
  const queryClient = useQueryClient();
  const [supplierId, setSupplierId] = useState("__none__");
  const [unitPrice, setUnitPrice] = useState("0");
  const [minimumOrderQty, setMinimumOrderQty] = useState("0");
  const [leadTimeDays, setLeadTimeDays] = useState("0");
  const [supplierSku, setSupplierSku] = useState("");
  const [notes, setNotes] = useState("");
  const [isPreferred, setIsPreferred] = useState(false);
  const [linkFieldErrors, setLinkFieldErrors] = useState<Record<string, string>>({});

  const linksQuery = useQuery({
    queryKey: ingredientSupplierLinksQueryKey(ingredientId),
    queryFn: () => posFetchIngredientSupplierLinks(ingredientId),
    enabled: open && Boolean(ingredientId),
  });

  const suppliersQuery = useQuery({
    queryKey: ["procurement-suppliers"],
    queryFn: posFetchSuppliers,
    enabled: open,
  });

  const upsertMutation = useMutation({
    mutationFn: () =>
      posUpsertIngredientSupplierLink(ingredientId, {
        supplierId,
        unitPrice: Number(unitPrice) || 0,
        minimumOrderQty: Number(minimumOrderQty) || 0,
        leadTimeDays: Number(leadTimeDays) || 0,
        isPreferred,
        supplierSku: supplierSku.trim(),
        notes: notes.trim(),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ingredientSupplierLinksQueryKey(ingredientId) });
      toast.success("Supplier link saved.");
    },
    onError: (err: unknown) => toast.error(formatPosMutationError(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (supId: string) => posDeleteIngredientSupplierLink(ingredientId, supId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ingredientSupplierLinksQueryKey(ingredientId) });
      toast.success("Link removed.");
    },
    onError: (err: unknown) => toast.error(formatPosMutationError(err)),
  });

  const suppliers = suppliersQuery.data?.data ?? [];
  const linkedIds = new Set((linksQuery.data ?? []).map(supplierIdOf));

  function submitLink(e: React.FormEvent) {
    e.preventDefault();
    const parsed = ingredientSupplierLinkUpsertSchema.safeParse({
      supplierId,
      unitPrice,
      minimumOrderQty,
      leadTimeDays,
      supplierSku,
      notes,
      isPreferred,
    });
    if (!parsed.success) {
      setLinkFieldErrors(fieldErrorsFromZodError(parsed.error));
      return;
    }
    setLinkFieldErrors({});
    upsertMutation.mutate();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setLinkFieldErrors({});
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Supplier links</DialogTitle>
          <DialogDescription>
            Many-to-many pricing for <span className="font-medium text-foreground">{ingredientName}</span>. Preferred
            supplier is unique per ingredient.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {linksQuery.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">Unit price</TableHead>
                    <TableHead className="w-[52px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(linksQuery.data ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground text-sm">
                        No supplier links yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (linksQuery.data ?? []).map((row) => (
                      <TableRow key={row._id}>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{supplierName(row)}</span>
                            {row.isPreferred ? (
                              <Badge variant="secondary" className="text-xs">
                                Preferred
                              </Badge>
                            ) : null}
                          </div>
                          <p className="text-muted-foreground text-xs">
                            MOQ {Number(row.minimumOrderQty ?? 0)} · Lead {Number(row.leadTimeDays ?? 0)}d{" "}
                            {row.supplierSku ? ` · SKU ${row.supplierSku}` : ""}
                          </p>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(Number(row.unitPrice ?? 0))}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            disabled={deleteMutation.isPending}
                            onClick={() => {
                              if (!confirm(`Remove supplier link for “${supplierName(row)}”?`)) return;
                              deleteMutation.mutate(supplierIdOf(row));
                            }}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          <form onSubmit={submitLink} className="space-y-3 rounded-lg border bg-muted/30 p-4">
            <p className="font-medium text-sm">Add or update link</p>
            <div className="space-y-2">
              <Label>Supplier</Label>
              <Select
                value={supplierId}
                onValueChange={(v) => {
                  setSupplierId(v);
                  setLinkFieldErrors((p) => ({ ...p, supplierId: "" }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={suppliersQuery.isLoading ? "Loading…" : "Select supplier"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select supplier…</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s._id} value={s._id}>
                      {s.name}
                      {linkedIds.has(s._id) ? " (linked)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {linkFieldErrors.supplierId ? (
                <p className="text-destructive text-sm">{linkFieldErrors.supplierId}</p>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="isl-price">Unit price</Label>
                <Input
                  id="isl-price"
                  type="number"
                  min={0}
                  step="0.01"
                  value={unitPrice}
                  onChange={(e) => {
                    setUnitPrice(e.target.value);
                    setLinkFieldErrors((p) => ({ ...p, unitPrice: "" }));
                  }}
                />
                {linkFieldErrors.unitPrice ? (
                  <p className="text-destructive text-sm">{linkFieldErrors.unitPrice}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="isl-moq">Min. order qty</Label>
                <Input
                  id="isl-moq"
                  type="number"
                  min={0}
                  step="0.01"
                  value={minimumOrderQty}
                  onChange={(e) => {
                    setMinimumOrderQty(e.target.value);
                    setLinkFieldErrors((p) => ({ ...p, minimumOrderQty: "" }));
                  }}
                />
                {linkFieldErrors.minimumOrderQty ? (
                  <p className="text-destructive text-sm">{linkFieldErrors.minimumOrderQty}</p>
                ) : null}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="isl-lead">Lead time (days)</Label>
                <Input
                  id="isl-lead"
                  type="number"
                  min={0}
                  step="1"
                  value={leadTimeDays}
                  onChange={(e) => {
                    setLeadTimeDays(e.target.value);
                    setLinkFieldErrors((p) => ({ ...p, leadTimeDays: "" }));
                  }}
                />
                {linkFieldErrors.leadTimeDays ? (
                  <p className="text-destructive text-sm">{linkFieldErrors.leadTimeDays}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="isl-sku">Supplier SKU</Label>
                <Input id="isl-sku" value={supplierSku} onChange={(e) => setSupplierSku(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="isl-notes">Notes</Label>
              <Input id="isl-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="isl-pref" checked={isPreferred} onCheckedChange={(v) => setIsPreferred(v === true)} />
              <Label htmlFor="isl-pref" className="font-normal text-sm">
                Preferred supplier (clears other preferred flags)
              </Label>
            </div>
            <DialogFooter className="gap-2 sm:gap-0 sm:pt-2">
              <Button type="submit" disabled={upsertMutation.isPending}>
                {upsertMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Save link
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
