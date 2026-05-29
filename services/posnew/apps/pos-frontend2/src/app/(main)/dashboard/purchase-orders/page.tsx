"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { format } from "date-fns";
import { AlertCircle, Calendar, FileText, Loader2, Plus, ShoppingCart, Trash2, Truck } from "lucide-react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/shared/data-table";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchIngredients, INGREDIENTS_QUERY_KEY, invalidateInventoryHubQueries } from "@/lib/inventory-api";
import { GOODS_RECEIPT_NOTES_QUERY_KEY, posFetchGoodsReceiptNotes } from "@/lib/pos-grn-api";
import { getPosLocationScopeId } from "@/lib/pos-location-scope";
import { posCan } from "@/lib/pos-permissions";
import {
  type PosPurchaseOrder,
  posCreatePurchaseOrder,
  posFetchPurchaseOrders,
  posFetchSuppliers,
  posReceivePurchaseOrder,
} from "@/lib/pos-procurement-api";
import { type PosPurchaseOrderFormData, posPurchaseOrderSchema } from "@/lib/schemas/procurement";
import { formatCurrency } from "@/lib/utils";
import { usePosAuthStore } from "@/stores/pos-auth-store";

const INGREDIENT_ID_RE = /^[a-fA-F0-9]{24}$/;

function PurchaseOrdersPageContent() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const permissions = usePosAuthStore((s) => s.user?.permissions ?? []);
  const canApRead = posCan(permissions, "backoffice.accounting.ap.read");
  const canApWrite = posCan(permissions, "backoffice.accounting.ap.write");
  const prefillDoneRef = useRef(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [poDialogFromLowStock, setPoDialogFromLowStock] = useState(false);
  const [viewingPO, setViewingPO] = useState<PosPurchaseOrder | null>(null);
  const [search, setSearch] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: true }]);
  const locationScopeId = getPosLocationScopeId();
  const sortValue = sorting[0];
  const sortBy = sortValue?.id === "createdAt" || sortValue?.id === "status" || sortValue?.id === "reference" ? sortValue.id : "createdAt";
  const sortDir = sortValue?.desc ? "desc" : "asc";

  // 1. Data Fetching
  const { data: poResult, isLoading: isLoadingPOs } = useQuery({
    queryKey: ["procurement-pos", pageIndex, pageSize, search, sortBy, sortDir],
    queryFn: () =>
      posFetchPurchaseOrders({
        page: pageIndex + 1,
        limit: pageSize,
        q: search.trim(),
        sortBy,
        sortDir,
      }),
  });
  const pos = poResult?.data ?? [];
  const poTotal = poResult?.total ?? 0;

  const { data: suppliersResult, isLoading: isLoadingSuppliers } = useQuery({
    queryKey: ["procurement-suppliers"],
    queryFn: posFetchSuppliers,
  });
  const suppliers = suppliersResult?.data ?? [];
  const { data: ingredientsRes } = useQuery({
    queryKey: [...INGREDIENTS_QUERY_KEY, { forPo: true }] as const,
    queryFn: () => fetchIngredients({ status: "active" }),
  });
  const ingredients = Array.isArray(ingredientsRes?.data) ? ingredientsRes.data : [];

  const { data: draftGrns = [] } = useQuery({
    queryKey: [...GOODS_RECEIPT_NOTES_QUERY_KEY, "drafts-by-po"],
    queryFn: () => posFetchGoodsReceiptNotes({ status: "draft" }),
  });

  const draftGrnByPoId = useMemo(() => {
    const map = new Map<string, string>();
    for (const grn of draftGrns) {
      const po = grn.purchaseOrder;
      const poId = typeof po === "string" ? po : po && typeof po === "object" && "_id" in po ? String(po._id) : "";
      if (poId && !map.has(poId)) map.set(poId, grn._id);
    }
    return map;
  }, [draftGrns]);

  // 2. Mutations
  const createMutation = useMutation({
    mutationFn: posCreatePurchaseOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["procurement-pos"] });
      toast.success("Purchase order created.");
      setIsDialogOpen(false);
    },
    onError: (err: any) => toast.error(err.message || "Failed to create PO."),
  });
  const receiveMutation = useMutation({
    mutationFn: (id: string) => posReceivePurchaseOrder(id),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["procurement-pos"] });
      void queryClient.invalidateQueries({ queryKey: GOODS_RECEIPT_NOTES_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: INGREDIENTS_QUERY_KEY });
      invalidateInventoryHubQueries(queryClient);
      const grnId = res.data?._id;
      toast.success("Draft GRN created. Open it to edit lines and confirm.", {
        action: grnId
          ? {
              label: "Open GRN",
              onClick: () => router.push(`/dashboard/goods-receipt-notes/${grnId}`),
            }
          : undefined,
      });
      setViewingPO(null);
    },
    onError: (err: any) => toast.error(err.message || "Failed to receive purchase order."),
  });

  // 3. Form Setup (Simplified for this version)
  const {
    register,
    handleSubmit,
    formState: { errors },
    control,
    reset,
    watch,
  } = useForm<PosPurchaseOrderFormData>({
    resolver: zodResolver(posPurchaseOrderSchema),
    defaultValues: {
      supplierId: "",
      status: "draft",
      items: [{ ingredientId: "", quantity: 1, unitPrice: 0 }],
      isDropship: false,
      customerOrder: "",
      costCenter: "",
      department: "",
      rfqReference: "",
    },
  });
  const { fields, append, remove } = useFieldArray({
    control,
    name: "items",
  });
  const watchedItems = watch("items");

  useEffect(() => {
    if (prefillDoneRef.current) return;
    const rawId = searchParams.get("ingredientId")?.trim() ?? "";
    if (!rawId || !INGREDIENT_ID_RE.test(rawId)) return;
    prefillDoneRef.current = true;
    const rawQty = searchParams.get("quantity");
    const q = rawQty != null ? Number(rawQty) : NaN;
    const quantity = Number.isFinite(q) && q > 0 ? q : 1;
    reset({
      supplierId: "",
      status: "draft",
      items: [{ ingredientId: rawId, quantity, unitPrice: 0 }],
      isDropship: false,
      customerOrder: "",
      costCenter: "",
      department: "",
      rfqReference: "",
    });
    setPoDialogFromLowStock(true);
    setIsDialogOpen(true);
  }, [searchParams, reset]);
  const formTotal = (watchedItems || []).reduce(
    (sum, row) => sum + (Number(row.quantity) || 0) * (Number(row.unitPrice) || 0),
    0,
  );

  const onSubmit = (data: PosPurchaseOrderFormData) => {
    createMutation.mutate(data);
  };

  const getMatchColor = (match?: PosPurchaseOrder["threeWayMatchStatus"]) => {
    switch (match) {
      case "matched":
        return "bg-emerald-100 text-emerald-700 border-emerald-200";
      case "mismatch":
        return "bg-rose-100 text-rose-700 border-rose-200";
      case "overridden":
        return "bg-amber-100 text-amber-700 border-amber-200";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "received":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "confirmed":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "partial":
        return "bg-amber-500/10 text-amber-500 border-amber-500/20";
      case "cancelled":
        return "bg-destructive/10 text-destructive border-destructive/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const poColumns: ColumnDef<PosPurchaseOrder>[] = [
    {
      accessorKey: "publicNumber",
      header: "PO number",
      cell: ({ row }) => <span className="font-medium">{row.original.publicNumber}</span>,
    },
    {
      accessorKey: "supplierName",
      header: "Supplier",
      cell: ({ row }) => row.original.supplierName || "Direct vendor",
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant="outline" className={getStatusColor(row.original.status)}>
          {row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: "totalAmount",
      header: "Total",
      cell: ({ row }) => <span className="font-medium">{formatCurrency(row.original.totalAmount || 0)}</span>,
    },
    {
      accessorKey: "createdByName",
      header: "Created by",
      cell: ({ row }) => row.original.createdByName || "—",
    },
    {
      accessorKey: "createdAt",
      header: "Created at",
      cell: ({ row }) => format(new Date(row.original.createdAt), "MMM dd, yyyy"),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const po = row.original;
        return (
          <div className="flex flex-wrap justify-end gap-1">
            {canApWrite ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/dashboard/accounting/vendor-bills?po=${po._id}`}>Bill</Link>
              </Button>
            ) : null}
            {draftGrnByPoId.get(po._id) ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/dashboard/goods-receipt-notes/${draftGrnByPoId.get(po._id)}`)}
              >
                Continue GRN
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={() => setViewingPO(po)}>
              <FileText className="mr-2 h-4 w-4" /> Details
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="font-semibold text-2xl tracking-tight md:text-3xl">Purchase orders</h1>
          <p className="max-w-2xl text-muted-foreground text-sm leading-relaxed">
            Track procurement, receive into stock, and open drafts from{" "}
            <span className="font-medium text-foreground">Inventory → Low stock</span> when you need to reorder.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canApRead ? (
            <Button variant="outline" asChild>
              <Link href="/dashboard/accounting/vendor-bills">Vendor bills</Link>
            </Button>
          ) : null}
          <Button
            onClick={() => {
              setPoDialogFromLowStock(false);
              reset({
                supplierId: "",
                status: "draft",
                items: [{ ingredientId: "", quantity: 1, unitPrice: 0 }],
                isDropship: false,
                customerOrder: "",
                costCenter: "",
                department: "",
                rfqReference: "",
              });
              setIsDialogOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> New Order
          </Button>
        </div>
      </div>

      <DataTable
        columns={poColumns}
        data={pos}
        isLoading={isLoadingPOs}
        emptyMessage="No purchase orders found."
        searchPlaceholder="Search by PO reference or notes..."
        searchValue={search}
        onSearchValueChange={(value) => {
          setSearch(value);
          setPageIndex(0);
        }}
        pageIndex={pageIndex}
        pageSize={pageSize}
        totalRows={poTotal}
        onPageChange={setPageIndex}
        onPageSizeChange={(value) => {
          setPageSize(value);
          setPageIndex(0);
        }}
        sorting={sorting}
        onSortingChange={setSorting}
        stickyHeader
      />

      {/* Simplified Create PO Dialog */}
      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) setPoDialogFromLowStock(false);
        }}
      >
        <DialogContent className="flex max-h-[90vh] w-[95vw] max-w-5xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 space-y-1.5 px-6 pt-6 pb-4 text-left">
            <DialogTitle className="font-semibold text-xl tracking-tight">Create Purchase Order</DialogTitle>
            <DialogDescription>
              Select a supplier, enter each line in the table, then review the subtotal and submit.
            </DialogDescription>
          </DialogHeader>
          <Separator className="shrink-0" />
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <div className="flex flex-col gap-5">
              {poDialogFromLowStock ? (
                <Alert>
                  <ShoppingCart className="size-4" />
                  <AlertTitle>Started from low stock</AlertTitle>
                  <AlertDescription>
                    Ingredient and quantity were pre-filled. Choose a supplier and unit pricing, then place the order.
                  </AlertDescription>
                </Alert>
              ) : null}
              {!locationScopeId ? (
                <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100">
                  <AlertCircle className="size-4" />
                  <AlertTitle>Location required</AlertTitle>
                  <AlertDescription>Select a location scope before creating purchase orders.</AlertDescription>
                </Alert>
              ) : null}

              <Card size="sm">
                <CardHeader className="border-b">
                  <CardTitle>Supplier</CardTitle>
                  <CardDescription>Who will fulfill this order?</CardDescription>
                </CardHeader>
                <CardContent className="pt-5">
                  <Label className="mb-2 block" htmlFor="po-supplier">
                    Vendor
                  </Label>
                  <Controller
                    control={control}
                    name="supplierId"
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger id="po-supplier" className="w-full">
                          <SelectValue
                            placeholder={isLoadingSuppliers ? "Loading suppliers..." : "Select a supplier"}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {suppliers.map((s) => (
                            <SelectItem key={s._id} value={s._id}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {errors.supplierId ? (
                    <p className="mt-2 text-destructive text-xs">{errors.supplierId.message}</p>
                  ) : null}
                </CardContent>
              </Card>

              <Card className="gap-0 py-0">
                <CardHeader className="border-b px-6 py-4">
                  <CardTitle className="flex items-center gap-2">
                    <ShoppingCart className="size-4 text-muted-foreground" aria-hidden />
                    Line items
                  </CardTitle>
                  <CardDescription>One row per ingredient. Scroll when you have many lines.</CardDescription>
                  <CardAction>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => append({ ingredientId: "", quantity: 1, unitPrice: 0 })}
                    >
                      <Plus className="mr-1.5 size-3.5" />
                      Add line
                    </Button>
                  </CardAction>
                </CardHeader>
                <CardContent className="px-0 py-0">
                  <ScrollArea className="h-[min(380px,42vh)] w-full">
                    <Table className="min-w-176">
                      <TableHeader>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableHead className="w-10 px-3 text-center font-medium text-muted-foreground text-xs">
                            #
                          </TableHead>
                          <TableHead className="min-w-56 px-3 font-medium text-muted-foreground text-xs">
                            Ingredient
                          </TableHead>
                          <TableHead className="w-24 px-3 text-right font-medium text-muted-foreground text-xs">
                            Qty
                          </TableHead>
                          <TableHead className="w-28 px-3 text-right font-medium text-muted-foreground text-xs">
                            Unit price
                          </TableHead>
                          <TableHead className="w-24 px-3 text-right font-medium text-muted-foreground text-xs">
                            Tax
                          </TableHead>
                          <TableHead className="w-32 px-3 text-right font-medium text-muted-foreground text-xs">
                            Subtotal
                          </TableHead>
                          <TableHead className="w-12 px-2 font-medium text-muted-foreground text-xs">
                            <span className="sr-only">Remove</span>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {fields.map((field, idx) => {
                          const row = watchedItems?.[idx];
                          const rowTotal = (Number(row?.quantity) || 0) * (Number(row?.unitPrice) || 0);
                          return (
                            <TableRow key={field.id} className="hover:bg-muted/30">
                              <TableCell className="px-3 py-3 text-center font-medium text-muted-foreground text-xs tabular-nums">
                                {idx + 1}
                              </TableCell>
                              <TableCell className="max-w-[20rem] whitespace-normal px-3 py-3 align-top">
                                <Controller
                                  control={control}
                                  name={`items.${idx}.ingredientId`}
                                  render={({ field: ingredientField }) => (
                                    <Select onValueChange={ingredientField.onChange} value={ingredientField.value}>
                                      <SelectTrigger className="w-full min-w-48">
                                        <SelectValue placeholder="Select ingredient" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {ingredients.map((ing) => (
                                          <SelectItem key={ing._id} value={ing._id}>
                                            {ing.name || "Unnamed"} {ing.unit ? `(${ing.unit})` : ""}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  )}
                                />
                                {errors.items?.[idx]?.ingredientId ? (
                                  <p className="mt-1.5 text-destructive text-xs leading-snug">
                                    {errors.items[idx]?.ingredientId?.message}
                                  </p>
                                ) : null}
                              </TableCell>
                              <TableCell className="px-3 py-3 align-top">
                                <Input
                                  type="number"
                                  step="0.01"
                                  className="h-9 text-right tabular-nums"
                                  {...register(`items.${idx}.quantity`, { valueAsNumber: true })}
                                />
                              </TableCell>
                              <TableCell className="px-3 py-3 align-top">
                                <Input
                                  type="number"
                                  step="0.01"
                                  className="h-9 text-right tabular-nums"
                                  {...register(`items.${idx}.unitPrice`, { valueAsNumber: true })}
                                />
                              </TableCell>
                              <TableCell className="px-3 py-3 align-top">
                                <div className="flex h-9 items-center justify-end rounded-md border bg-muted/30 px-2 text-muted-foreground text-xs tabular-nums">
                                  0%
                                </div>
                              </TableCell>
                              <TableCell className="px-3 py-3 align-top">
                                <div className="flex h-9 items-center justify-end rounded-md border bg-muted/50 px-2 font-medium text-sm tabular-nums">
                                  {formatCurrency(rowTotal)}
                                </div>
                              </TableCell>
                              <TableCell className="px-2 py-3 align-top">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="size-9 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                  disabled={fields.length <= 1}
                                  onClick={() => remove(idx)}
                                  aria-label={`Remove line ${idx + 1}`}
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
                {typeof errors.items?.message === "string" ? (
                  <CardContent className="border-t py-3">
                    <p className="text-destructive text-xs">{errors.items.message}</p>
                  </CardContent>
                ) : null}
                <CardFooter className="flex flex-col gap-1 border-t bg-muted/25 py-4 sm:flex-row sm:items-center sm:justify-end sm:gap-4">
                  <span className="text-muted-foreground text-xs sm:text-sm">Subtotal (excl. tax)</span>
                  <span className="font-semibold text-base tabular-nums sm:text-lg">{formatCurrency(formTotal)}</span>
                </CardFooter>
              </Card>

              <Card size="sm">
                <CardHeader className="border-b">
                  <CardTitle>Procurement options</CardTitle>
                  <CardDescription>Optional routing, cost allocation, and references.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5 pt-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <Label htmlFor="po-isDropship" className="font-medium text-sm">
                        Dropship order
                      </Label>
                      <p className="text-muted-foreground text-xs leading-relaxed">
                        Supplier ships straight to customer. No warehouse receipt.
                      </p>
                    </div>
                    <Controller
                      control={control}
                      name="isDropship"
                      render={({ field }) => (
                        <Switch id="po-isDropship" checked={!!field.value} onCheckedChange={field.onChange} />
                      )}
                    />
                  </div>
                  {watch("isDropship") ? (
                    <>
                      <Separator />
                      <div className="space-y-2">
                        <Label htmlFor="po-customer-order">Customer order reference</Label>
                        <Input
                          id="po-customer-order"
                          placeholder="24-char customer order id"
                          {...register("customerOrder")}
                        />
                        {errors.customerOrder ? (
                          <p className="text-destructive text-xs">{errors.customerOrder.message}</p>
                        ) : null}
                      </div>
                    </>
                  ) : null}
                  <Separator />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="po-cost-center">Cost center</Label>
                      <Input id="po-cost-center" placeholder="e.g. KITCHEN-01" {...register("costCenter")} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="po-department">Department</Label>
                      <Input id="po-department" placeholder="e.g. FOH / BOH" {...register("department")} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="po-rfq">RFQ reference</Label>
                    <Input id="po-rfq" placeholder="Source quote number" {...register("rfqReference")} />
                  </div>
                </CardContent>
              </Card>
              </div>
            </div>
            <Separator className="shrink-0" />
            <DialogFooter className="shrink-0 gap-2 border-border/60 border-t bg-muted/10 px-6 py-4">
              <Button type="button" variant="outline" className="h-10" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="h-10" disabled={createMutation.isPending || !locationScopeId}>
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Place Order
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!viewingPO} onOpenChange={(o) => !o && setViewingPO(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex items-center justify-between pr-6">
              <DialogTitle className="text-xl tracking-tight">{viewingPO?.publicNumber || "Purchase order"}</DialogTitle>
              <div className="flex flex-wrap gap-1">
                <Badge variant="outline" className={getStatusColor(viewingPO?.status || "")}>
                  {viewingPO?.status}
                </Badge>
                <Badge variant="outline" className={getMatchColor(viewingPO?.threeWayMatchStatus)}>
                  3WM: {viewingPO?.threeWayMatchStatus ?? "pending"}
                </Badge>
                {viewingPO?.isDropship ? <Badge variant="secondary">DROPSHIP</Badge> : null}
              </div>
            </div>
            <DialogDescription>Detailed view of procurement order.</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-8 py-4">
            <div className="space-y-4">
              <div>
                <Label className="font-bold text-[10px] text-muted-foreground uppercase">Supplier Information</Label>
                <div className="mt-1 flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded bg-primary/10">
                    <Truck className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{viewingPO?.supplierName || "N/A"}</p>
                    <p className="text-muted-foreground text-xs">Authorized Vendor</p>
                  </div>
                </div>
              </div>
              <div>
                <Label className="font-bold text-[10px] text-muted-foreground uppercase">Order Date</Label>
                <div className="mt-1 flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  {viewingPO && format(new Date(viewingPO.createdAt), "PPPP")}
                </div>
              </div>
            </div>
            <div className="flex flex-col items-center justify-center rounded-lg border bg-muted/30 p-4">
              <p className="font-bold text-[10px] text-muted-foreground uppercase">Total Order Value</p>
              <p className="font-bold text-3xl text-primary tracking-tighter">
                {formatCurrency(viewingPO?.totalAmount || 0)}
              </p>
            </div>
          </div>

          {viewingPO && (viewingPO.costCenter || viewingPO.department || viewingPO.rfqReference) ? (
            <div className="grid grid-cols-3 gap-2 rounded-md border bg-muted/30 p-3 text-xs">
              <div>
                <p className="font-bold text-[10px] text-muted-foreground uppercase">Cost center</p>
                <p className="font-medium">{viewingPO.costCenter || "—"}</p>
              </div>
              <div>
                <p className="font-bold text-[10px] text-muted-foreground uppercase">Department</p>
                <p className="font-medium">{viewingPO.department || "—"}</p>
              </div>
              <div>
                <p className="font-bold text-[10px] text-muted-foreground uppercase">RFQ ref</p>
                <p className="font-medium">{viewingPO.rfqReference || "—"}</p>
              </div>
            </div>
          ) : null}

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs">Item</TableHead>
                  <TableHead className="text-right text-xs">Qty</TableHead>
                  <TableHead className="text-right text-xs">Price</TableHead>
                  <TableHead className="text-right text-xs">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {viewingPO?.items.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium text-sm">{item.name || "Ingredient Item"}</TableCell>
                    <TableCell className="text-right text-sm">{item.quantity}</TableCell>
                    <TableCell className="text-right text-sm">{formatCurrency(item.unitPrice)}</TableCell>
                    <TableCell className="text-right font-semibold text-sm">
                      {formatCurrency(item.totalPrice || 0)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <DialogFooter className="sm:justify-between">
            <Button variant="ghost" size="sm" onClick={() => window.print()}>
              <FileText className="mr-2 h-4 w-4" /> Print PO
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setViewingPO(null)}>
                Close
              </Button>
              {viewingPO?._id && draftGrnByPoId.get(viewingPO._id) ? (
                <Button
                  variant="secondary"
                  onClick={() => router.push(`/dashboard/goods-receipt-notes/${draftGrnByPoId.get(viewingPO._id)}`)}
                >
                  Continue draft GRN
                </Button>
              ) : null}
              {(viewingPO?.status === "confirmed" || viewingPO?.status === "partial") &&
                !draftGrnByPoId.get(viewingPO._id) && (
                  <Button
                    onClick={() => {
                      if (!viewingPO?._id) return;
                      receiveMutation.mutate(viewingPO._id);
                    }}
                    disabled={receiveMutation.isPending}
                  >
                    {receiveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Start receipt (GRN)
                  </Button>
                )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PurchaseOrdersFallback() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-9 w-64 animate-pulse rounded-md bg-muted" />
          <div className="mt-2 h-4 w-96 max-w-full animate-pulse rounded-md bg-muted" />
        </div>
        <div className="h-10 w-32 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="h-64 animate-pulse rounded-md border bg-muted/30" />
    </div>
  );
}

export default function PurchaseOrdersPage() {
  return (
    <Suspense fallback={<PurchaseOrdersFallback />}>
      <PurchaseOrdersPageContent />
    </Suspense>
  );
}
