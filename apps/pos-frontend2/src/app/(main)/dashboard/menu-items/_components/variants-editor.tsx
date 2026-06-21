"use client";

import { useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  type PosMenuItemVariant,
  posCreateMenuItemVariant,
  posDeleteMenuItemVariant,
  posFetchMenuItemVariants,
  posUpdateMenuItemVariant,
} from "@/lib/pos-catalog-api";
import { formatCurrency } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  menuItemId: string;
  menuItemName: string;
};

export function VariantsEditor({ open, onOpenChange, menuItemId, menuItemName }: Props) {
  const queryClient = useQueryClient();
  const [editingVariant, setEditingVariant] = useState<PosMenuItemVariant | null>(null);
  const [variantName, setVariantName] = useState("");
  const [sku, setSku] = useState("");
  const [priceOverride, setPriceOverride] = useState("");

  const { data: variants = [], isLoading } = useQuery({
    queryKey: ["menu-item-variants", menuItemId],
    queryFn: () => posFetchMenuItemVariants(menuItemId),
    enabled: !!menuItemId && open,
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<PosMenuItemVariant>) => posCreateMenuItemVariant(menuItemId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["menu-item-variants", menuItemId] });
      toast.success("Variant created.");
      resetForm();
    },
    onError: (err: any) => toast.error(err.message || "Failed to create variant."),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<PosMenuItemVariant> }) => posUpdateMenuItemVariant(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["menu-item-variants", menuItemId] });
      toast.success("Variant updated.");
      resetForm();
    },
    onError: (err: any) => toast.error(err.message || "Failed to update variant."),
  });

  const deleteMutation = useMutation({
    mutationFn: posDeleteMenuItemVariant,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["menu-item-variants", menuItemId] });
      toast.success("Variant deleted.");
    },
    onError: (err: any) => toast.error(err.message || "Failed to delete variant."),
  });

  const resetForm = () => {
    setEditingVariant(null);
    setVariantName("");
    setSku("");
    setPriceOverride("");
  };

  const handleEdit = (v: PosMenuItemVariant) => {
    setEditingVariant(v);
    setVariantName(v.variantName || "");
    setSku(v.sku || "");
    setPriceOverride(v.priceOverride?.toString() || "");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!variantName.trim()) {
      toast.error("Variant name is required.");
      return;
    }

    const data: Partial<PosMenuItemVariant> = {
      variantName: variantName.trim(),
      sku: sku.trim() || undefined,
      priceOverride: priceOverride ? Number(priceOverride) : null,
    };

    if (editingVariant) {
      updateMutation.mutate({ id: editingVariant._id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Management Variants: {menuItemName}</DialogTitle>
          <DialogDescription>
            Add sizes or styles (e.g. Small, Medium, Large). Each can have its own price override.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <form onSubmit={handleSubmit} className="space-y-4 rounded-md border bg-muted/20 p-4">
            <h3 className="font-semibold text-sm">{editingVariant ? "Edit Variant" : "Add New Variant"}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="v-name">Variant Name</Label>
                <Input
                  id="v-name"
                  value={variantName}
                  onChange={(e) => setVariantName(e.target.value)}
                  placeholder="e.g. Small"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="v-sku">SKU (Optional)</Label>
                <Input id="v-sku" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Unique SKU" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="v-price">Price Override (USD)</Label>
                <Input
                  id="v-price"
                  type="number"
                  step="0.01"
                  value={priceOverride}
                  onChange={(e) => setPriceOverride(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div className="flex items-end gap-2">
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {editingVariant ? "Update" : "Add"}
                </Button>
                {editingVariant && (
                  <Button type="button" variant="ghost" onClick={resetForm}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          </form>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center">
                      <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : variants.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground italic">
                      No variants yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  variants.map((v) => (
                    <TableRow key={v._id}>
                      <TableCell className="font-medium">{v.variantName}</TableCell>
                      <TableCell>{v.sku || "—"}</TableCell>
                      <TableCell>{v.priceOverride != null ? formatCurrency(v.priceOverride) : "Inherited"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(v)}>
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => {
                              if (confirm("Delete this variant?")) deleteMutation.mutate(v._id);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
