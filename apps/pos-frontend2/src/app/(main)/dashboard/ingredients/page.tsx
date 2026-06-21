"use client";

import { useMemo, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutGrid, Loader2, Plus } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { ResourcePage } from "@/components/resource-page";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatPosMutationError } from "@/lib/format-pos-api-error";
import { fetchIngredientCategories } from "@/lib/ingredient-categories-api";
import { createIngredient, deleteIngredient, type IngredientRecord, updateIngredient } from "@/lib/inventory-api";
import { ResourceRegistry } from "@/lib/mdd/resource-config";
import { posUploadImage } from "@/lib/pos-upload-api";
import { type IngredientFormData, ingredientFormSchema } from "@/lib/schemas/ingredients";

import { IngredientSupplierLinksDialog } from "./_components/ingredient-supplier-links-dialog";

function toPayload(data: IngredientFormData, _isCreate: boolean): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: data.name.trim(),
    sku: data.sku?.trim() ?? "",
    description: data.description?.trim() ?? "",
    status: data.status,
    unit: data.unit,
    reorderThreshold: data.reorderThreshold,
    reorderQuantity: data.reorderQuantity,
    unitCost: data.unitCost,
    supplier: data.supplier?.trim() ?? "",
    imageUrl: data.imageUrl?.trim() ?? "",
    safetyStockLevel: data.safetyStockLevel,
    leadTimeDays: data.leadTimeDays,
    currentStock: data.currentStock,
    minimumOrderQuantity: data.minimumOrderQuantity,
    maximumStockLevel: data.maximumStockLevel,
    shelfLifeDays: data.shelfLifeDays,
    packagingType: data.packagingType?.trim() ?? "",
    tags: Array.isArray(data.tags) ? data.tags.map((t) => t.trim()).filter(Boolean) : [],
    isAutoReorder: !!data.isAutoReorder,
    isDropshipOnly: !!data.isDropshipOnly,
    isSerialTracked: !!data.isSerialTracked,
    serialNumberFormat: data.serialNumberFormat?.trim() ?? "",
    barcode: data.barcode?.trim() ?? "",
  };
  if (data.categoryId && /^[a-fA-F0-9]{24}$/.test(data.categoryId)) {
    payload.category = data.categoryId;
  } else {
    payload.category = null;
  }
  const pu = data.purchaseUnit?.trim();
  if (pu && pu !== "" && ["g", "kg", "ml", "l", "piece"].includes(pu)) {
    payload.purchaseUnit = pu;
    payload.purchaseToStockFactor = data.purchaseToStockFactor;
  }
  return payload;
}

const DEFAULT_INGREDIENT_FORM: IngredientFormData = {
  name: "",
  sku: "",
  description: "",
  categoryId: "",
  status: "active",
  unit: "g",
  purchaseUnit: "",
  purchaseToStockFactor: 1,
  currentStock: 0,
  reorderThreshold: 0,
  reorderQuantity: 0,
  unitCost: 0,
  supplier: "",
  imageUrl: "",
  safetyStockLevel: 0,
  leadTimeDays: 0,
  minimumOrderQuantity: 0,
  maximumStockLevel: 0,
  shelfLifeDays: 0,
  packagingType: "",
  tags: [],
  isAutoReorder: false,
  isDropshipOnly: false,
  isSerialTracked: false,
  serialNumberFormat: "",
  barcode: "",
};

export default function IngredientsPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<IngredientRecord | null>(null);
  const [supplierLinksFor, setSupplierLinksFor] = useState<IngredientRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<IngredientRecord | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "archived">("active");

  const { data: categoriesRes } = useQuery({
    queryKey: ["ingredient-categories"],
    queryFn: fetchIngredientCategories,
  });
  const categories = Array.isArray(categoriesRes?.data) ? categoriesRes.data : [];

  const queryParams = useMemo(() => (statusFilter === "all" ? {} : { status: statusFilter }), [statusFilter]);

  const form = useForm<IngredientFormData>({
    resolver: zodResolver(ingredientFormSchema),
    defaultValues: DEFAULT_INGREDIENT_FORM,
  });

  const createMutation = useMutation({
    mutationFn: (data: IngredientFormData) => createIngredient(toPayload(data, true)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ResourceRegistry.ingredients.id] });
      toast.success("Ingredient created.");
      closeDialog();
    },
    onError: (err: unknown) => toast.error(formatPosMutationError(err)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: IngredientFormData }) =>
      updateIngredient(id, toPayload(data, false)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ResourceRegistry.ingredients.id] });
      toast.success("Ingredient updated.");
      closeDialog();
    },
    onError: (err: unknown) => toast.error(formatPosMutationError(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteIngredient,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ResourceRegistry.ingredients.id] });
      toast.success("Ingredient deleted.");
    },
    onError: (err: unknown) => toast.error(formatPosMutationError(err)),
  });

  const uploadImageMutation = useMutation({
    mutationFn: posUploadImage,
    onSuccess: (res) => {
      if (res.data?.url) {
        form.setValue("imageUrl", res.data.url, { shouldValidate: true });
        toast.success("Image uploaded.");
      } else {
        toast.warning("Upload succeeded but no URL was returned.");
      }
    },
    onError: (err: unknown) => toast.error(formatPosMutationError(err)),
  });

  function closeDialog() {
    setDialogOpen(false);
    setEditing(null);
    form.reset();
  }

  function handleAction(row: any, actionId: string) {
    const ingredient = row as IngredientRecord;
    if (actionId === "edit") {
      setEditing(ingredient);
      const catId =
        typeof ingredient.category === "object"
          ? ingredient.category?._id
          : typeof ingredient.category === "string"
            ? ingredient.category
            : "";
      form.reset({
        ...DEFAULT_INGREDIENT_FORM,
        name: ingredient.name ?? "",
        sku: ingredient.sku ?? "",
        description: ingredient.description ?? "",
        categoryId: catId || "",
        status: ingredient.status === "archived" ? "archived" : "active",
        unit: (ingredient.unit as (typeof DEFAULT_INGREDIENT_FORM)["unit"]) || "g",
        purchaseUnit: (ingredient.purchaseUnit as (typeof DEFAULT_INGREDIENT_FORM)["purchaseUnit"]) || "",
        purchaseToStockFactor: ingredient.purchaseToStockFactor ?? 1,
        currentStock: ingredient.currentStock ?? 0,
        reorderThreshold: ingredient.reorderThreshold ?? 0,
        reorderQuantity: ingredient.reorderQuantity ?? 0,
        unitCost: ingredient.unitCost ?? 0,
        supplier: ingredient.supplier ?? "",
        imageUrl: ingredient.imageUrl ?? "",
        safetyStockLevel: ingredient.safetyStockLevel ?? 0,
        leadTimeDays: ingredient.leadTimeDays ?? 0,
        minimumOrderQuantity: ingredient.minimumOrderQuantity ?? 0,
        maximumStockLevel: ingredient.maximumStockLevel ?? 0,
        shelfLifeDays: ingredient.shelfLifeDays ?? 0,
        packagingType: ingredient.packagingType ?? "",
        tags: Array.isArray(ingredient.tags) ? ingredient.tags : [],
        isAutoReorder: !!ingredient.isAutoReorder,
        isDropshipOnly: !!ingredient.isDropshipOnly,
        isSerialTracked: !!ingredient.isSerialTracked,
        serialNumberFormat: ingredient.serialNumberFormat ?? "",
        barcode: ingredient.barcode ?? "",
      });
      setDialogOpen(true);
    } else if (actionId === "delete") {
      setDeleteTarget(ingredient);
    } else if (actionId === "supplier-links") {
      setSupplierLinksFor(ingredient);
    }
  }

  function onSubmit(data: IngredientFormData) {
    if (editing) {
      updateMutation.mutate({ id: editing._id, data });
    } else {
      createMutation.mutate(data);
    }
  }

  function confirmDeleteIngredient() {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget._id, {
      onSuccess: () => setDeleteTarget(null),
    });
  }

  return (
    <>
      <ResourcePage
        resource={ResourceRegistry.ingredients}
        params={queryParams}
        tableEmptyMessage="No ingredients yet. Add your first ingredient to start stock tracking."
        onAction={handleAction}
        extraActions={
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger className="w-[160px] bg-card/50">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={() => {
                setEditing(null);
                form.reset();
                setDialogOpen(true);
              }}
            >
              <Plus className="mr-2 size-4" /> Add ingredient
            </Button>
          </div>
        }
      />

      <Dialog open={dialogOpen} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit ingredient" : "New ingredient"}</DialogTitle>
            <DialogDescription>Master data for stock, recipes, and forecasting.</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ing-name">Name</Label>
              <Input id="ing-name" {...form.register("name")} placeholder="e.g. Tomatoes" />
            </div>
            <div className="space-y-3 rounded-md border bg-muted/20 p-3">
              <div className="flex items-center gap-2 font-bold text-muted-foreground text-xs uppercase tracking-wider">
                <LayoutGrid className="h-3 w-3" /> Procurement Forecasting
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Safety Stock</Label>
                  <Input type="number" step="0.01" {...form.register("safetyStockLevel")} />
                </div>
                <div className="space-y-2">
                  <Label>Lead Time (Days)</Label>
                  <Input type="number" step="1" {...form.register("leadTimeDays")} />
                </div>
                <div className="space-y-2">
                  <Label>Minimum Order Qty</Label>
                  <Input type="number" step="0.01" {...form.register("minimumOrderQuantity")} />
                </div>
                <div className="space-y-2">
                  <Label>Maximum Stock</Label>
                  <Input type="number" step="0.01" {...form.register("maximumStockLevel")} />
                </div>
                <div className="space-y-2">
                  <Label>Shelf Life (Days)</Label>
                  <Input type="number" step="1" {...form.register("shelfLifeDays")} />
                </div>
                <div className="space-y-2">
                  <Label>Packaging</Label>
                  <Input placeholder="e.g. Case of 12" {...form.register("packagingType")} />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-md border bg-background p-2">
                <div>
                  <Label className="text-xs">Auto-reorder suggestions</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Include in `/purchase-orders/suggestions/reorder`.
                  </p>
                </div>
                <Controller
                  control={form.control}
                  name="isAutoReorder"
                  render={({ field }) => <Switch checked={!!field.value} onCheckedChange={field.onChange} />}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border bg-background p-2">
                <div>
                  <Label className="text-xs">Dropship only (no stocked qty)</Label>
                  <p className="text-[11px] text-muted-foreground">Always fulfilled via direct PO to customer.</p>
                </div>
                <Controller
                  control={form.control}
                  name="isDropshipOnly"
                  render={({ field }) => <Switch checked={!!field.value} onCheckedChange={field.onChange} />}
                />
              </div>
            </div>
            <div className="space-y-3 rounded-md border bg-muted/20 p-3">
              <div className="font-bold text-muted-foreground text-xs uppercase tracking-wider">
                Identification & Serialization
              </div>
              <div className="space-y-2">
                <Label>Barcode (GTIN / EAN)</Label>
                <Input placeholder="Optional" {...form.register("barcode")} />
              </div>
              <div className="flex items-center justify-between rounded-md border bg-background p-2">
                <div>
                  <Label className="text-xs">Track serial numbers per unit</Label>
                  <p className="text-[11px] text-muted-foreground">Forces serial capture on every movement.</p>
                </div>
                <Controller
                  control={form.control}
                  name="isSerialTracked"
                  render={({ field }) => <Switch checked={!!field.value} onCheckedChange={field.onChange} />}
                />
              </div>
              <div className="space-y-2">
                <Label>Serial format regex</Label>
                <Input placeholder="e.g. ^SN-[0-9]{6}$" {...form.register("serialNumberFormat")} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>SKU</Label>
                <Input {...form.register("sku")} />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Controller
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="archived">Archived</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Controller
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger>
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {categories.map((c: any) => (
                        <SelectItem key={c._id} value={c._id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea rows={2} {...form.register("description")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ing-image-upload">Image</Label>
              <Input
                id="ing-image-upload"
                type="file"
                accept="image/*"
                disabled={uploadImageMutation.isPending}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  uploadImageMutation.mutate(file);
                }}
              />
              <p className="text-muted-foreground text-xs">
                Uses POS upload endpoint (`/api/upload`). You can also paste an image URL below.
              </p>
              <Input placeholder="Image URL (optional)" {...form.register("imageUrl")} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Stock unit</Label>
                <Controller
                  control={form.control}
                  name="unit"
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["g", "kg", "ml", "l", "piece"].map((u) => (
                          <SelectItem key={u} value={u}>
                            {u}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label>Current Qty</Label>
                <Input type="number" step="0.01" {...form.register("currentStock")} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                )}
                {editing ? "Save" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && deleteTarget) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete ingredient?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-medium text-foreground">{deleteTarget?.name ?? "this ingredient"}</span>? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmDeleteIngredient}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <IngredientSupplierLinksDialog
        open={supplierLinksFor != null}
        onOpenChange={(o) => !o && setSupplierLinksFor(null)}
        ingredientId={supplierLinksFor?._id ?? ""}
        ingredientName={supplierLinksFor?.name ?? ""}
      />
    </>
  );
}
