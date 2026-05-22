"use client";

import { useMemo, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { useForm } from "react-hook-form";
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
import { formatPosMutationError } from "@/lib/format-pos-api-error";
import { ResourceRegistry } from "@/lib/mdd/resource-config";
import { collectDescendantMenuCategoryIds } from "@/lib/menu-category-tree";
import { posFetchAccounts } from "@/lib/pos-accounting-api";
import {
  CATALOG_QUERY_KEYS,
  type PosCategory,
  posCreateCategory,
  posDeleteCategory,
  posFetchCategories,
  posUpdateCategory,
} from "@/lib/pos-catalog-api";
import { POS_CATEGORY_NONE_VALUE, type PosCategoryFormData, posCategorySchema } from "@/lib/schemas/catalog";

function parentCategoryIdFromRow(c: PosCategory): string {
  const p = c.parentCategory;
  if (p == null) return POS_CATEGORY_NONE_VALUE;
  if (typeof p === "string") return p;
  if (p._id != null) return String(p._id);
  return POS_CATEGORY_NONE_VALUE;
}

function revenueAccountIdFromRow(c: PosCategory): string {
  const r = c.revenueAccount;
  if (r == null) return POS_CATEGORY_NONE_VALUE;
  if (typeof r === "string") return r;
  if (r._id != null) return String(r._id);
  return POS_CATEGORY_NONE_VALUE;
}

export default function CategoriesPage() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<PosCategory | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PosCategory | null>(null);

  const { data: categoryRows = [] } = useQuery({
    queryKey: CATALOG_QUERY_KEYS.categories(),
    queryFn: posFetchCategories,
  });

  const { data: revenueAccounts = [] } = useQuery({
    queryKey: ["accounting", "accounts", "revenue", "active"],
    queryFn: () => posFetchAccounts({ type: "revenue", active: "true" }),
  });

  const excludedParentIds = useMemo(() => {
    if (!editingCategory) return new Set<string>();
    const d = collectDescendantMenuCategoryIds(editingCategory._id, categoryRows);
    d.add(editingCategory._id);
    return d;
  }, [editingCategory, categoryRows]);

  const parentOptions = useMemo(
    () => categoryRows.filter((c) => !excludedParentIds.has(String(c._id))),
    [categoryRows, excludedParentIds],
  );

  const createMutation = useMutation({
    mutationFn: posCreateCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ResourceRegistry.categories.id] });
      queryClient.invalidateQueries({ queryKey: CATALOG_QUERY_KEYS.categories() });
      toast.success("Category created successfully.");
      handleCloseDialog();
    },
    onError: (err: unknown) => toast.error(formatPosMutationError(err)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<PosCategory> }) => posUpdateCategory(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ResourceRegistry.categories.id] });
      queryClient.invalidateQueries({ queryKey: CATALOG_QUERY_KEYS.categories() });
      toast.success("Category updated successfully.");
      handleCloseDialog();
    },
    onError: (err: unknown) =>
      toast.error(formatPosMutationError(err, { forbiddenHint: "You can't update categories for this account." })),
  });

  const deleteMutation = useMutation({
    mutationFn: posDeleteCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ResourceRegistry.categories.id] });
      queryClient.invalidateQueries({ queryKey: CATALOG_QUERY_KEYS.categories() });
      toast.success("Category deleted.");
    },
    onError: (err: unknown) =>
      toast.error(formatPosMutationError(err, { forbiddenHint: "You can't delete categories for this account." })),
  });

  const form = useForm<PosCategoryFormData>({
    resolver: zodResolver(posCategorySchema),
    defaultValues: {
      name: "",
      sortOrder: 1,
      color: "#525252",
      parentCategoryId: POS_CATEGORY_NONE_VALUE,
      revenueAccountId: POS_CATEGORY_NONE_VALUE,
    },
  });

  const handleOpenDialog = (category?: PosCategory) => {
    if (category) {
      setEditingCategory(category);
      form.reset({
        name: category.name || "",
        sortOrder: category.sortOrder ?? 1,
        color: category.color?.trim() || "#525252",
        parentCategoryId: parentCategoryIdFromRow(category),
        revenueAccountId: revenueAccountIdFromRow(category),
      });
    } else {
      const nextSortOrder = Math.max(...categoryRows.map((c) => c.sortOrder || 0), 0) + 1;
      setEditingCategory(null);
      form.reset({
        name: "",
        sortOrder: nextSortOrder,
        color: "#525252",
        parentCategoryId: POS_CATEGORY_NONE_VALUE,
        revenueAccountId: POS_CATEGORY_NONE_VALUE,
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingCategory(null);
    form.reset();
  };

  const handleAction = (row: PosCategory, actionId: string) => {
    if (actionId === "edit") {
      handleOpenDialog(row);
    } else if (actionId === "delete") {
      setDeleteTarget(row);
    }
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget._id, {
      onSuccess: () => setDeleteTarget(null),
    });
  };

  const onSubmit = (data: PosCategoryFormData) => {
    const parentCategory = data.parentCategoryId === POS_CATEGORY_NONE_VALUE ? null : data.parentCategoryId;
    const revenueAccount = data.revenueAccountId === POS_CATEGORY_NONE_VALUE ? null : data.revenueAccountId;

    const payload: Partial<PosCategory> = {
      name: data.name,
      sortOrder: data.sortOrder,
      parentCategory: parentCategory ?? null,
      revenueAccount: revenueAccount ?? null,
    };
    payload.color = data.color?.trim() || "#525252";

    if (editingCategory) {
      updateMutation.mutate({ id: editingCategory._id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const parentValue = form.watch("parentCategoryId");
  const revenueValue = form.watch("revenueAccountId");

  return (
    <>
      <ResourcePage
        resource={ResourceRegistry.categories}
        onAction={handleAction}
        extraActions={
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="mr-2 h-4 w-4" /> Add Category
          </Button>
        }
      />

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCategory ? "Edit Category" : "New Category"}</DialogTitle>
            <DialogDescription>
              Set name, display order, optional parent (subcategory), color, and revenue GL account for sales posting.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Category Name</Label>
              <Input
                id="name"
                disabled={createMutation.isPending || updateMutation.isPending}
                {...form.register("name")}
                placeholder="e.g. Food, Sandwiches"
              />
              {form.formState.errors.name && (
                <p className="font-medium text-destructive text-sm">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="parentCategoryId">Parent category</Label>
              <Select
                value={parentValue}
                onValueChange={(v) => form.setValue("parentCategoryId", v, { shouldValidate: true })}
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                <SelectTrigger id="parentCategoryId">
                  <SelectValue placeholder="None (top-level)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={POS_CATEGORY_NONE_VALUE}>None (top-level)</SelectItem>
                  {parentOptions.map((c) => (
                    <SelectItem key={c._id} value={String(c._id)}>
                      {c.name || c._id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sortOrder">Sort Order</Label>
              <Input
                id="sortOrder"
                type="number"
                min={1}
                step={1}
                disabled={createMutation.isPending || updateMutation.isPending}
                {...form.register("sortOrder")}
              />
              {form.formState.errors.sortOrder && (
                <p className="font-medium text-destructive text-sm">{form.formState.errors.sortOrder.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="color">Color</Label>
              <Input
                id="color"
                type="color"
                className="h-10 w-full cursor-pointer"
                disabled={createMutation.isPending || updateMutation.isPending}
                {...form.register("color")}
              />
              <p className="text-muted-foreground text-xs">Swatch used in POS and guest menu.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="revenueAccountId">Revenue GL account</Label>
              <Select
                value={revenueValue}
                onValueChange={(v) => form.setValue("revenueAccountId", v, { shouldValidate: true })}
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                <SelectTrigger id="revenueAccountId">
                  <SelectValue placeholder="Use org default" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={POS_CATEGORY_NONE_VALUE}>Use organization default</SelectItem>
                  {revenueAccounts.map((a) => (
                    <SelectItem key={a._id} value={a._id}>
                      {a.code} — {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                Applies to this category and subcategories unless they set their own account (sale posting walks up the
                tree).
              </p>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseDialog}
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {editingCategory ? "Update Category" : "Create Category"}
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
            <AlertDialogTitle>Delete category?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-medium text-foreground">{deleteTarget?.name ?? "this category"}</span>? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <Button type="button" variant="destructive" onClick={confirmDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Deleting..." : "Yes, delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
