"use client";

import { useEffect, useMemo, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Calendar as CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Loader2,
  Mail,
  Pencil,
  Phone,
  Plus,
  Star,
  Trash2,
  User as UserIcon,
} from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { PhoneInput } from "@/components/reui/phone-input";
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
import { Badge } from "@/components/ui/badge";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  type PosCustomer,
  posCreateCustomer,
  posDeleteCustomer,
  posListCustomers,
  posUpdateCustomer,
} from "@/lib/pos-customer-api";
import { formatCurrency } from "@/lib/utils";

const customerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters."),
  email: z.string().email("Invalid email address.").optional().or(z.literal("")),
  phone: z.string().optional(),
  vatNumber: z.string().optional(),
  isBillingCustomer: z.boolean(),
});

type CustomerFormData = z.infer<typeof customerSchema>;

export default function CustomersPage() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<PosCustomer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PosCustomer | null>(null);
  const [search, setSearch] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  // 1. Fetch Data
  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["customers-list"],
    queryFn: posListCustomers,
  });

  // 2. Mutations
  const createMutation = useMutation({
    mutationFn: posCreateCustomer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers-list"] });
      toast.success("Customer profile created.");
      handleCloseDialog();
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to create customer.";
      toast.error(message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<PosCustomer> }) => posUpdateCustomer(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers-list"] });
      toast.success("Customer profile updated.");
      handleCloseDialog();
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to update customer.";
      toast.error(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: posDeleteCustomer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers-list"] });
      toast.success("Customer profile removed.");
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to remove customer.";
      toast.error(message);
    },
  });

  // 3. Form Setup
  const form = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      vatNumber: "",
      isBillingCustomer: false,
    },
  });

  const handleOpenDialog = (customer?: PosCustomer) => {
    if (customer) {
      setEditingCustomer(customer);
      form.reset({
        name: customer.name || "",
        email: customer.email || "",
        phone: customer.phone || "",
        vatNumber: customer.vatNumber || "",
        isBillingCustomer: customer.isBillingCustomer !== false,
      });
    } else {
      setEditingCustomer(null);
      form.reset({
        name: "",
        email: "",
        phone: "",
        vatNumber: "",
        isBillingCustomer: false,
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingCustomer(null);
    form.reset();
  };

  const onSubmit = (data: CustomerFormData) => {
    if (editingCustomer) {
      updateMutation.mutate({ id: editingCustomer._id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleDelete = (customer: PosCustomer) => {
    setDeleteTarget(customer);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget._id, {
      onSuccess: () => setDeleteTarget(null),
    });
  };

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return customers;
    return customers.filter((customer) => {
      const blob = [customer.name, customer.email ?? "", customer.phone ?? ""].join(" ").toLowerCase();
      return blob.includes(query);
    });
  }, [customers, search]);

  const totalRows = filteredCustomers.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  useEffect(() => {
    setPageIndex((currentPage) => {
      if (currentPage <= totalPages - 1) {
        return currentPage;
      }
      return Math.max(0, totalPages - 1);
    });
  }, [totalPages]);

  const pagedCustomers = useMemo(() => {
    const startIndex = pageIndex * pageSize;
    return filteredCustomers.slice(startIndex, startIndex + pageSize);
  }, [filteredCustomers, pageIndex, pageSize]);

  const canGoPrevious = pageIndex > 0;
  const canGoNext = pageIndex < totalPages - 1;
  const shownStart = totalRows === 0 ? 0 : pageIndex * pageSize + 1;
  const shownEnd = Math.min((pageIndex + 1) * pageSize, totalRows);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-bold text-3xl tracking-tight">Customers</h1>
          <p className="text-muted-foreground">Manage your guest profiles and loyalty records.</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPageIndex(0);
            }}
            className="w-full sm:w-72"
            placeholder="Search by name, email, or phone..."
          />
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="mr-2 h-4 w-4" /> Add Customer
          </Button>
        </div>
      </div>

      <div className="space-y-3 rounded-md border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            Showing <span className="font-medium text-foreground">{filteredCustomers.length}</span> of{" "}
            <span className="font-medium text-foreground">{customers.length}</span> customers
          </span>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Contact Info</TableHead>
                <TableHead>Billing</TableHead>
                <TableHead>Loyalty Points</TableHead>
                <TableHead>Activity</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-9 w-9 rounded-full" />
                        <Skeleton className="h-4 w-[120px]" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-[150px]" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-[80px]" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-[80px]" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-[100px]" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="ml-auto h-8 w-16" />
                    </TableCell>
                  </TableRow>
                ))
              ) : pagedCustomers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    {search.trim() ? "No customers match your search." : "No customer records found."}
                  </TableCell>
                </TableRow>
              ) : (
                pagedCustomers.map((customer) => (
                  <TableRow key={customer._id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full border bg-muted">
                          <UserIcon className="h-5 w-5 text-muted-foreground/70" />
                        </div>
                        <span className="font-medium">{customer.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {customer.email ? (
                          <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                            <Mail className="h-3 w-3" /> {customer.email}
                          </div>
                        ) : null}
                        {customer.phone ? (
                          <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                            <Phone className="h-3 w-3" /> {customer.phone}
                          </div>
                        ) : null}
                        {!customer.email && !customer.phone ? <span className="text-muted-foreground text-xs">—</span> : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={customer.isBillingCustomer !== false ? "default" : "secondary"}>
                        {customer.isBillingCustomer !== false ? "Billable" : "Non-billable"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                        <span className="font-semibold">{customer.loyaltyPoints || 0}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 text-[11px]">
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <CalendarIcon className="h-3 w-3" />
                          Last: {customer.lastVisit ? new Date(customer.lastVisit).toLocaleDateString() : "Never"}
                        </div>
                        <div className="font-medium">Total: {formatCurrency(customer.totalSpent || 0)}</div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(customer)}>
                          <Pencil className="h-4 w-4" />
                          <span className="sr-only">Edit</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDelete(customer)}
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Delete</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-muted-foreground text-sm">
            Showing {shownStart}-{shownEnd} of {totalRows}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="customers-rows-per-page" className="text-sm">
                Rows
              </Label>
              <Select
                value={`${pageSize}`}
                onValueChange={(value) => {
                  setPageSize(Number(value));
                  setPageIndex(0);
                }}
              >
                <SelectTrigger id="customers-rows-per-page" className="h-8 w-[80px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent side="top">
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="text-muted-foreground text-sm tabular-nums">
              Page {totalRows === 0 ? 0 : pageIndex + 1} of {totalRows === 0 ? 0 : totalPages}
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPageIndex((currentPage) => Math.max(0, currentPage - 1))}
              disabled={!canGoPrevious}
            >
              <ChevronLeftIcon className="h-4 w-4" />
              <span className="sr-only">Previous page</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPageIndex((currentPage) => Math.min(totalPages - 1, currentPage + 1))}
              disabled={!canGoNext}
            >
              <ChevronRightIcon className="h-4 w-4" />
              <span className="sr-only">Next page</span>
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingCustomer ? "Edit Customer" : "New Customer"}</DialogTitle>
            <DialogDescription>Create a profile to track orders, loyalty points, and preferences.</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="cname">Full Name</Label>
                <Input id="cname" {...form.register("name")} placeholder="e.g. Alice Smith" />
                {form.formState.errors.name && (
                  <p className="text-destructive text-sm">{form.formState.errors.name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="cemail">Email Address</Label>
                <Input id="cemail" type="email" {...form.register("email")} placeholder="alice@example.com" />
                {form.formState.errors.email && (
                  <p className="text-destructive text-sm">{form.formState.errors.email.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="cphone">Phone Number</Label>
                <Controller
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <PhoneInput
                      id="cphone"
                      autoComplete="tel"
                      placeholder="Enter phone number"
                      value={field.value || undefined}
                      onChange={(v) => field.onChange(v ?? "")}
                    />
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cvat">VAT Number (optional)</Label>
                <Input id="cvat" {...form.register("vatNumber")} placeholder="e.g. LB1234567" />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="cbillable">Billing customer</Label>
                  <p className="text-muted-foreground text-xs">
                    Enable for AR use cases like recurring invoices and contract billing.
                  </p>
                </div>
                <Controller
                  control={form.control}
                  name="isBillingCustomer"
                  render={({ field }) => (
                    <Switch id="cbillable" checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                  )}
                />
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
                {editingCustomer ? "Update Profile" : "Create Profile"}
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
            <AlertDialogTitle>Remove customer profile?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove{" "}
              <span className="font-medium text-foreground">{deleteTarget?.name ?? "this customer"}</span>? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <Button type="button" variant="destructive" onClick={confirmDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Removing..." : "Yes, remove"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
