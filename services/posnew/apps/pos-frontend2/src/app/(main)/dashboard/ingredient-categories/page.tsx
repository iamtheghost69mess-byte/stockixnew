"use client";

import { useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Hash, Loader2, Plus } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { IngredientCategoriesDataTable } from "@/app/(main)/dashboard/ingredient-categories/_components/ingredient-categories-data-table";
import { ResourcePage } from "@/components/resource-page";
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
import {
  createIngredientCategory,
  deleteIngredientCategory,
  type IngredientCategoryRow,
  updateIngredientCategory,
} from "@/lib/ingredient-categories-api";
import { ResourceRegistry } from "@/lib/mdd/resource-config";
import { type IngredientCategoryFormData, ingredientCategoryFormSchema } from "@/lib/schemas/ingredients";

export default function IngredientCategoriesPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<IngredientCategoryRow | null>(null);

  const form = useForm<IngredientCategoryFormData>({
    resolver: zodResolver(ingredientCategoryFormSchema),
    defaultValues: {
      name: "",
      description: "",
      sortOrder: 0,
      parentCategoryId: "",
      taxCode: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: IngredientCategoryFormData) =>
      createIngredientCategory({
        name: data.name.trim(),
        description: data.description?.trim(),
        sortOrder: data.sortOrder,
        parentCategory: data.parentCategoryId === "none" ? null : data.parentCategoryId || null,
        taxCode: data.taxCode || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ResourceRegistry.ingredientCategories.id] });
      queryClient.invalidateQueries({ queryKey: [ResourceRegistry.ingredients.id] });
      toast.success("Category created successfully.");
      closeDialog();
    },
    onError: (err: Error) => toast.error(err.message || "Could not create category."),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: IngredientCategoryFormData }) =>
      updateIngredientCategory(id, {
        name: data.name.trim(),
        description: data.description?.trim(),
        sortOrder: data.sortOrder,
        parentCategory: data.parentCategoryId === "none" ? null : data.parentCategoryId || null,
        taxCode: data.taxCode || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ResourceRegistry.ingredientCategories.id] });
      queryClient.invalidateQueries({ queryKey: [ResourceRegistry.ingredients.id] });
      toast.success("Category updated successfully.");
      closeDialog();
    },
    onError: (err: Error) => toast.error(err.message || "Could not update category."),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteIngredientCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ResourceRegistry.ingredientCategories.id] });
      queryClient.invalidateQueries({ queryKey: [ResourceRegistry.ingredients.id] });
      toast.success("Category removed successfully.");
    },
    onError: (err: Error) => toast.error(err.message || "Could not delete category."),
  });

  function closeDialog() {
    setDialogOpen(false);
    setEditing(null);
    form.reset();
  }

  function handleEdit(row: IngredientCategoryRow) {
    setEditing(row);
    const parentId = typeof row.parentCategory === "string" ? row.parentCategory : row.parentCategory?._id || "none";
    form.reset({
      name: row.name ?? "",
      description: row.description ?? "",
      sortOrder: row.sortOrder ?? 0,
      parentCategoryId: parentId,
      taxCode: row.taxCode ?? "",
    });
    setDialogOpen(true);
  }

  function onSubmit(data: IngredientCategoryFormData) {
    if (editing) {
      updateMutation.mutate({ id: editing._id, data });
    } else {
      createMutation.mutate(data);
    }
  }

  function handleAdd() {
    setEditing(null);
    form.reset({ name: "", description: "", sortOrder: 0, parentCategoryId: "none", taxCode: "" });
    setDialogOpen(true);
  }

  return (
    <ResourcePage
      resource={ResourceRegistry.ingredientCategories}
      extraActions={
        <Button onClick={handleAdd}>
          <Plus className="mr-2 size-4" /> New Category
        </Button>
      }
    >
      {(data, isLoading) => (
        <>
          <IngredientCategoriesDataTable
            rows={data}
            isLoading={isLoading}
            onEdit={handleEdit}
            onDelete={async (id) => {
              await deleteMutation.mutateAsync(id);
            }}
            isDeleting={deleteMutation.isPending}
          />

          <Dialog open={dialogOpen} onOpenChange={(o) => !o && closeDialog()}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{editing ? "Edit Category" : "New Category"}</DialogTitle>
                <DialogDescription>Define hierarchical organization and taxation policy.</DialogDescription>
              </DialogHeader>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input {...form.register("name")} placeholder="e.g. Produce" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Parent Category</Label>
                    <Controller
                      control={form.control}
                      name="parentCategoryId"
                      render={({ field }) => (
                        <Select onValueChange={field.onChange} value={field.value}>
                          <SelectTrigger>
                            <SelectValue placeholder="Root (None)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Root (None)</SelectItem>
                            {data
                              .filter((c) => c._id !== editing?._id)
                              .map((c) => (
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
                    <Label>Tax Code</Label>
                    <div className="relative">
                      <Hash className="absolute top-2.5 left-2 h-4 w-4 text-muted-foreground" />
                      <Input className="pl-8" {...form.register("taxCode")} placeholder="TAX20" />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={closeDialog}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                    {(createMutation.isPending || updateMutation.isPending) && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {editing ? "Save Changes" : "Create Category"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </>
      )}
    </ResourcePage>
  );
}
