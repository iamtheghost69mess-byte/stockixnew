"use client";

import { Suspense, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, Plus, Truck } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { AccessGate } from "@/components/access-gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
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
import { fetchLocations } from "@/lib/inventory-api";
import { posCan } from "@/lib/pos-permissions";
import { posFetchSuppliers } from "@/lib/pos-procurement-api";
import { posCreateVendorReturn, posListVendorReturns } from "@/lib/pos-vendor-return-api";
import { type VendorReturnFormData, vendorReturnSchema } from "@/lib/schemas/vendor-return";
import { usePosAuthStore } from "@/stores/pos-auth-store";

function VendorReturnsPageContent() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const permissions = usePosAuthStore((s) => s.user?.permissions ?? []);
  const canWrite = posCan(permissions, "backoffice.inventory.write");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // 1. Data Fetching
  const { data: returnsRes, isLoading: isLoadingReturns } = useQuery({
    queryKey: ["vendor-returns"],
    queryFn: () => posListVendorReturns(),
  });
  const returns = Array.isArray(returnsRes?.data) ? returnsRes.data : [];

  const { data: suppliersRes, isLoading: isLoadingSuppliers } = useQuery({
    queryKey: ["procurement-suppliers"],
    queryFn: posFetchSuppliers,
  });
  const suppliers = suppliersRes?.data ?? [];

  const { data: locationsRes, isLoading: isLoadingLocations } = useQuery({
    queryKey: ["locations"],
    queryFn: fetchLocations,
  });
  const locations = Array.isArray(locationsRes?.data) ? locationsRes.data : [];

  // 2. Mutations
  const createMutation = useMutation({
    mutationFn: posCreateVendorReturn,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["vendor-returns"] });
      toast.success("Vendor return session created.");
      setIsDialogOpen(false);
      if (res.data?._id) {
        router.push(`/dashboard/inventory/vendor-returns/${res.data._id}`);
      }
    },
    onError: (err: any) => toast.error(err.message || "Failed to create return."),
  });

  // 3. Form Setup
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
    reset,
  } = useForm<VendorReturnFormData>({
    resolver: zodResolver(vendorReturnSchema),
    defaultValues: {
      supplierId: "",
      locationId: "",
      returnDate: format(new Date(), "yyyy-MM-dd"),
      notes: "",
    },
  });

  const returnDateValue = watch("returnDate");

  const onSubmit = (data: VendorReturnFormData) => {
    createMutation.mutate(data);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "shipped":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "confirmed":
        return "bg-amber-500/10 text-amber-500 border-amber-500/20";
      case "cancelled":
        return "bg-destructive/10 text-destructive border-destructive/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="font-semibold text-2xl tracking-tight md:text-3xl">Vendor Returns (RTV)</h1>
          <p className="max-w-2xl text-muted-foreground text-sm leading-relaxed">
            Manage returns to suppliers, track credits, and formalize stock deductions for damaged or incorrect goods.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!canWrite}
            title={canWrite ? undefined : "Requires backoffice.inventory.write"}
            onClick={() => {
              reset();
              setIsDialogOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> New Return
          </Button>
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Return Ref</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoadingReturns ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-16" />
                  </TableCell>
                  <TableCell className="text-right">
                    <Skeleton className="ml-auto h-8 w-16" />
                  </TableCell>
                </TableRow>
              ))
            ) : returns.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  No vendor returns found.
                </TableCell>
              </TableRow>
            ) : (
              returns.map((ret: any) => (
                <TableRow key={ret._id}>
                  <TableCell className="font-mono text-xs uppercase">{ret.returnNumber}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Truck className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">
                        {typeof ret.supplier === "object" ? ret.supplier.name : "N/A"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{format(new Date(ret.returnDate), "MMM dd, yyyy")}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={getStatusColor(ret.status)}>
                      {ret.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/dashboard/inventory/vendor-returns/${ret._id}`}>View Details</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Vendor Return</DialogTitle>
            <DialogDescription>Initialize a return session for a supplier and warehouse.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Supplier</Label>
              <Select onValueChange={(v) => setValue("supplierId", v)}>
                <SelectTrigger>
                  <SelectValue placeholder={isLoadingSuppliers ? "Loading..." : "Select supplier"} />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s._id} value={s._id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.supplierId && <p className="text-destructive text-xs">{errors.supplierId.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>Location (Warehouse)</Label>
              <Select onValueChange={(v) => setValue("locationId", v)}>
                <SelectTrigger>
                  <SelectValue placeholder={isLoadingLocations ? "Loading..." : "Select warehouse"} />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((l) => (
                    <SelectItem key={l._id} value={l._id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.locationId && <p className="text-destructive text-xs">{errors.locationId.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="vendor-return-date">Return Date</Label>
              <DatePicker
                id="vendor-return-date"
                value={returnDateValue}
                onValueChange={(v) => setValue("returnDate", v, { shouldValidate: true, shouldDirty: true })}
                className="w-full"
              />
              {errors.returnDate && <p className="text-destructive text-xs">{errors.returnDate.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>Notes (Optional)</Label>
              <Input placeholder="Reason for batch return..." {...register("notes")} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Draft
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VendorReturnsFallback() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-64 uppercase" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export default function VendorReturnsPage() {
  return (
    <AccessGate permission="backoffice.inventory.read">
      <Suspense fallback={<VendorReturnsFallback />}>
        <VendorReturnsPageContent />
      </Suspense>
    </AccessGate>
  );
}
