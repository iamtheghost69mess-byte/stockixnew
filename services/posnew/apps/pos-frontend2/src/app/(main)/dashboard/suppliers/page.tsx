"use client";

import { useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { format } from "date-fns";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { PhoneInput } from "@/components/reui/phone-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/shared/data-table";
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
import { fetchIngredientCategories } from "@/lib/ingredient-categories-api";
import {
  type PosSupplier,
  posCreateSupplier,
  posDeleteSupplier,
  posFetchSuppliers,
  posUpdateSupplier,
} from "@/lib/pos-procurement-api";
import { type PosSupplierFormData, posSupplierSchema } from "@/lib/schemas/procurement";

export default function SuppliersPage() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<PosSupplier | null>(null);
  const [search, setSearch] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: true }]);

  const sortValue = sorting[0];
  const sortBy = sortValue?.id === "name" || sortValue?.id === "createdAt" || sortValue?.id === "status" ? sortValue.id : "createdAt";
  const sortDir = sortValue?.desc ? "desc" : "asc";

  const { data: suppliersResult, isLoading } = useQuery({
    queryKey: ["procurement-suppliers", pageIndex, pageSize, search, sortBy, sortDir],
    queryFn: () =>
      posFetchSuppliers({
        page: pageIndex + 1,
        limit: pageSize,
        q: search.trim(),
        sortBy,
        sortDir,
      }),
  });
  const suppliers = suppliersResult?.data ?? [];
  const suppliersTotal = suppliersResult?.total ?? 0;

  const { data: categoriesRes } = useQuery({
    queryKey: ["ingredient-categories", "supplier-form"],
    queryFn: fetchIngredientCategories,
  });
  const categories = Array.isArray(categoriesRes?.data) ? categoriesRes.data : [];

  // 2. Mutations
  const createMutation = useMutation({
    mutationFn: posCreateSupplier,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["procurement-suppliers"] });
      toast.success("Supplier created successfully.");
      handleCloseDialog();
    },
    onError: (err: any) => toast.error(err.message || "Failed to create supplier."),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<PosSupplier> }) => posUpdateSupplier(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["procurement-suppliers"] });
      toast.success("Supplier updated successfully.");
      handleCloseDialog();
    },
    onError: (err: any) => toast.error(err.message || "Failed to update supplier."),
  });

  const deleteMutation = useMutation({
    mutationFn: posDeleteSupplier,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["procurement-suppliers"] });
      toast.success("Supplier deleted successfully.");
    },
    onError: (err: any) => toast.error(err.message || "Failed to delete supplier."),
  });

  // 3. Form Setup
  const form = useForm<PosSupplierFormData>({
    resolver: zodResolver(posSupplierSchema),
    defaultValues: {
      name: "",
      contactName: "",
      email: "",
      phone: "",
      address: "",
      categoryId: "",
    },
  });

  const handleOpenDialog = (supplier?: PosSupplier) => {
    if (supplier) {
      setEditingSupplier(supplier);
      form.reset({
        name: supplier.name || "",
        contactName: supplier.contactName || "",
        email: supplier.email || "",
        phone: supplier.phone || "",
        address: supplier.address || "",
        categoryId: supplier.categoryId || "",
      });
    } else {
      setEditingSupplier(null);
      form.reset({ name: "", contactName: "", email: "", phone: "", address: "", categoryId: "" });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingSupplier(null);
    form.reset();
  };

  const onSubmit = (data: PosSupplierFormData) => {
    const normalizedCategoryId = data.categoryId === "__none__" ? "" : data.categoryId;
    if (normalizedCategoryId && !categories.some((category) => category._id === normalizedCategoryId)) {
      toast.error("Selected category is no longer valid for this organization.");
      return;
    }
    const payload = { ...data, categoryId: normalizedCategoryId };
    if (editingSupplier) {
      updateMutation.mutate({ id: editingSupplier._id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const columns: ColumnDef<PosSupplier>[] = [
      {
        accessorKey: "name",
        header: "Supplier name",
        cell: ({ row }) => <div className="font-medium">{row.original.name || "—"}</div>,
      },
      {
        accessorKey: "contactName",
        header: "Contact",
        cell: ({ row }) => <span>{row.original.contactName || "—"}</span>,
      },
      {
        accessorKey: "email",
        header: "Email",
        cell: ({ row }) => <span>{row.original.email || "—"}</span>,
      },
      {
        accessorKey: "categoryName",
        header: "Category",
        cell: ({ row }) => <Badge variant="outline">{row.original.categoryName || "Uncategorized"}</Badge>,
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={row.original.status === "archived" ? "secondary" : "default"}>
            {row.original.status === "archived" ? "Archived" : "Active"}
          </Badge>
        ),
      },
      {
        accessorKey: "createdAt",
        header: "Created date",
        cell: ({ row }) => (row.original.createdAt ? format(new Date(row.original.createdAt), "MMM dd, yyyy") : "—"),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(row.original)}>
              <Pencil className="h-4 w-4" />
              <span className="sr-only">Edit</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive hover:text-destructive"
              onClick={() => handleDelete(row.original._id, row.original.name || "")}
            >
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">Delete</span>
            </Button>
          </div>
        ),
      },
  ];

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete "${name}"?`)) {
      deleteMutation.mutate(id);
    }
  };



  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-3xl tracking-tight">Suppliers</h1>
          <p className="text-muted-foreground">Manage your ingredient vendors and contact information.</p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="mr-2 h-4 w-4" /> Add Supplier
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={suppliers}
        isLoading={isLoading}
        emptyMessage="No suppliers found."
        searchPlaceholder="Search suppliers..."
        searchValue={search}
        onSearchValueChange={(value) => {
          setSearch(value);
          setPageIndex(0);
        }}
        pageIndex={pageIndex}
        pageSize={pageSize}
        totalRows={suppliersTotal}
        onPageChange={setPageIndex}
        onPageSizeChange={(value) => {
          setPageSize(value);
          setPageIndex(0);
        }}
        sorting={sorting}
        onSortingChange={setSorting}
        stickyHeader
      />


      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSupplier ? "Edit Supplier" : "New Supplier"}</DialogTitle>
            <DialogDescription>Enter the supplier's contact and category details.</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2">
                <Label htmlFor="name">Supplier Name</Label>
                <Input
                  id="name"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  {...form.register("name")}
                  placeholder="e.g. Fresh Produce Co."
                />
                {form.formState.errors.name && (
                  <p className="font-medium text-destructive text-xs">{form.formState.errors.name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="contactName">Contact Person</Label>
                <Input
                  id="contactName"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  {...form.register("contactName")}
                  placeholder="John Doe"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Controller
                  control={form.control}
                  name="categoryId"
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value || "__none__"}>
                      <SelectTrigger id="category">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.length === 0 ? (
                          <SelectItem value="__none__" disabled>
                            No categories available
                          </SelectItem>
                        ) : (
                          <>
                            <SelectItem value="__none__">No category</SelectItem>
                            {categories.map((category) => (
                              <SelectItem key={category._id} value={category._id}>
                                {category.name}
                              </SelectItem>
                            ))}
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  {...form.register("email")}
                  placeholder="sales@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Controller
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <PhoneInput
                      id="phone"
                      autoComplete="tel"
                      placeholder="Enter phone number"
                      disabled={createMutation.isPending || updateMutation.isPending}
                      value={field.value || undefined}
                      onChange={(v) => field.onChange(v ?? "")}
                    />
                  )}
                />
              </div>
              <div className="col-span-2 space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  {...form.register("address")}
                  placeholder="123 Supply Ln, Warehouse City"
                />
              </div>
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
                {editingSupplier ? "Update Supplier" : "Create Supplier"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
