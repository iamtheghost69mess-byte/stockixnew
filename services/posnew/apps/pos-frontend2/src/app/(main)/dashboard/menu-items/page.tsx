"use client";

import { useCallback, useState } from "react";

import { useRouter } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
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
import { ResourceRegistry } from "@/lib/mdd/resource-config";
import {
  posAttachModifierGroupsToMenuItem,
  type PosMenuItem,
  posFetchModifierGroups,
  posCreateMenuItem,
  posDeleteMenuItem,
  posFetchCategories,
  posUpdateMenuItem,
} from "@/lib/pos-catalog-api";
import { resolveMenuItemDualPrices } from "@/lib/pos-menu-prices";
import { posUploadImage } from "@/lib/pos-upload-api";
import { type PosMenuItemFormData, posMenuItemSchema } from "@/lib/schemas/catalog";

import { VariantsEditor } from "./_components/variants-editor";

export default function MenuItemsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PosMenuItem | null>(null);
  const [variantsForItem, setVariantsForItem] = useState<PosMenuItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PosMenuItem | null>(null);
  const [selectedModifierGroupIds, setSelectedModifierGroupIds] = useState<string[]>([]);

  // 1. Fetch Categories for Form
  const { data: categories = [] } = useQuery({
    queryKey: ["menu-categories"],
    queryFn: posFetchCategories,
  });
  const { data: modifierGroups = [] } = useQuery({
    queryKey: ["modifier-groups"],
    queryFn: posFetchModifierGroups,
  });

  // 2. Mutations
  const createMutation = useMutation({
    mutationFn: posCreateMenuItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ResourceRegistry.menuItems.id] });
      toast.success("Menu item created.");
      handleCloseDialog();
    },
    onError: (err: any) => toast.error(err.message || "Failed to create item."),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<PosMenuItem> }) => posUpdateMenuItem(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ResourceRegistry.menuItems.id] });
      toast.success("Menu item updated.");
      handleCloseDialog();
    },
    onError: (err: any) => toast.error(err.message || "Failed to update item."),
  });

  const deleteMutation = useMutation({
    mutationFn: posDeleteMenuItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ResourceRegistry.menuItems.id] });
      toast.success("Menu item deleted.");
    },
    onError: (err: any) => toast.error(err.message || "Failed to delete item."),
  });

  // 3. Form Setup
  const form = useForm<PosMenuItemFormData>({
    resolver: zodResolver(posMenuItemSchema),
    defaultValues: {
      name: "",
      description: "",
      priceUsd: 0,
      priceLbp: 0,
      category: "",
      imageUrl: "",
      isAvailable: true,
      showOnPOS: true,
    },
  });

  const handleOpenDialog = useCallback(
    (item?: PosMenuItem) => {
      if (item) {
        setEditingItem(item);
        const catId = typeof item.category === "string" ? item.category : item.category?._id || "";
        const d = resolveMenuItemDualPrices(item);
        form.reset({
          name: item.name || "",
          description: item.description || "",
          priceUsd: d.priceUsd,
          priceLbp: d.priceLbp,
          category: catId,
          imageUrl: item.imageUrl || "",
          isAvailable: item.isAvailable ?? true,
          showOnPOS: item.showOnPOS ?? true,
        });
        const currentGroupIds = Array.isArray(item.modifierGroups)
          ? item.modifierGroups
              .map((entry) => String(entry?.groupId || ""))
              .filter((id) => id.length > 0)
          : [];
        setSelectedModifierGroupIds(currentGroupIds);
      } else {
        setEditingItem(null);
        form.reset({
          name: "",
          description: "",
          priceUsd: 0,
          priceLbp: 0,
          category: categories[0]?._id || "",
          imageUrl: "",
          isAvailable: true,
          showOnPOS: true,
        });
        setSelectedModifierGroupIds([]);
      }
      setIsDialogOpen(true);
    },
    [categories, form],
  );

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingItem(null);
    form.reset();
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await posUploadImage(file);
      if (res.data?.url) {
        form.setValue("imageUrl", res.data.url, { shouldValidate: true });
        toast.success("Image uploaded!");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to upload image.");
    }
  };

  const onSubmit = (data: PosMenuItemFormData) => {
    if (editingItem) {
      updateMutation.mutate(
        { id: editingItem._id, data },
        {
          onSuccess: async (updatedItem) => {
            try {
              await posAttachModifierGroupsToMenuItem(
                updatedItem._id,
                selectedModifierGroupIds
              );
            } catch (error: any) {
              toast.error(error?.message || "Failed to attach modifier groups.");
            }
          },
        }
      );
    } else {
      createMutation.mutate(data, {
        onSuccess: async (createdItem) => {
          if (selectedModifierGroupIds.length === 0) return;
          try {
            await posAttachModifierGroupsToMenuItem(
              createdItem._id,
              selectedModifierGroupIds
            );
          } catch (error: any) {
            toast.error(error?.message || "Failed to attach modifier groups.");
          }
        },
      });
    }
  };

  const handleAction = (row: any, actionId: string, value: any) => {
    const item = row as PosMenuItem;
    if (actionId === "edit") {
      handleOpenDialog(item);
    } else if (actionId === "delete") {
      setDeleteTarget(item);
    } else if (actionId === "variants") {
      setVariantsForItem(item);
    } else if (actionId === "open-recipe") {
      router.push(`/dashboard/recipes?menuItemId=${encodeURIComponent(item._id)}`);
    } else if (actionId === "toggle-availability") {
      updateMutation.mutate({ id: item._id, data: { isAvailable: value } });
    }
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget._id, {
      onSuccess: () => setDeleteTarget(null),
    });
  };

  return (
    <>
      <ResourcePage
        resource={ResourceRegistry.menuItems}
        onAction={handleAction}
        extraActions={
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="mr-2 h-4 w-4" /> Add Item
          </Button>
        }
      />

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Menu Item" : "New Menu Item"}</DialogTitle>
            <DialogDescription>
              Enter USD and LBP shelf prices. Tax is applied separately at checkout.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2">
                <Label htmlFor="name">Item Name</Label>
                <Input id="name" {...form.register("name")} placeholder="e.g. Double Cheeseburger" />
              </div>
              <div className="col-span-2 space-y-2">
                <Label htmlFor="description">Note</Label>
                <Textarea
                  id="description"
                  {...form.register("description")}
                  placeholder="e.g. Contains cheddar cheese, pickles, and house sauce."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="priceUsd">Price (USD)</Label>
                <Input id="priceUsd" type="number" step="0.01" {...form.register("priceUsd")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="priceLbp">Price (LBP)</Label>
                <Input id="priceLbp" type="number" step="1" {...form.register("priceLbp")} />
              </div>
              <div className="col-span-2 space-y-2">
                <Label htmlFor="category">Category</Label>
                <Controller
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat._id} value={cat._id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="col-span-2 space-y-2">
                <Label htmlFor="imageFile">Menu Image (Optional)</Label>
                <div className="flex items-center gap-4">
                  <Input id="imageFile" type="file" accept="image/*" onChange={handleImageUpload} />
                  {form.watch("imageUrl") && (
                    <img
                      src={form.watch("imageUrl")}
                      alt="Preview"
                      className="h-10 w-10 rounded-md border object-cover"
                    />
                  )}
                </div>
              </div>
              <div className="flex items-center space-x-2 pt-2">
                <Controller
                  control={form.control}
                  name="isAvailable"
                  render={({ field }) => (
                    <Switch id="isAvailable" checked={field.value} onCheckedChange={field.onChange} />
                  )}
                />
                <Label htmlFor="isAvailable">Available in Menu</Label>
              </div>
              <div className="flex items-center space-x-2 pt-2">
                <Controller
                  control={form.control}
                  name="showOnPOS"
                  render={({ field }) => (
                    <Switch id="showOnPOS" checked={field.value} onCheckedChange={field.onChange} />
                  )}
                />
                <Label htmlFor="showOnPOS">Show on POS</Label>
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Modifier Groups</Label>
                <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-2">
                  {modifierGroups.map((group) => {
                    const checked = selectedModifierGroupIds.includes(group._id);
                    return (
                      <label key={group._id} className="flex items-center justify-between text-sm">
                        <span>{group.name}</span>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setSelectedModifierGroupIds((previous) => {
                              if (checked) {
                                return previous.filter((id) => id !== group._id);
                              }
                              return [...previous, group._id];
                            });
                          }}
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {editingItem ? "Update Item" : "Create Item"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <VariantsEditor
        open={!!variantsForItem}
        onOpenChange={(open) => !open && setVariantsForItem(null)}
        menuItemId={variantsForItem?._id || ""}
        menuItemName={variantsForItem?.name || ""}
      />

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
            <AlertDialogTitle>Delete menu item?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-medium text-foreground">{deleteTarget?.name ?? "this item"}</span>? This action
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
