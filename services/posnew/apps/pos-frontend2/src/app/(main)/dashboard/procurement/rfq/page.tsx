"use client";

import { useState } from "react";

import Link from "next/link";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Receipt, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { fetchIngredients } from "@/lib/inventory-api";
import { posCreateRFQ, posFetchRFQs, posFetchSuppliers } from "@/lib/pos-procurement-api";

export default function RFQPage() {
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [reference, setReference] = useState("");
  const [expectedAt, setExpectedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
  const [lines, setLines] = useState<Array<{ ingredientId: string; quantity: number; description: string }>>([]);

  const {
    data: rfqs = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["procurement-rfqs"],
    queryFn: () => posFetchRFQs(),
  });

  const { data: suppliersResult } = useQuery({
    queryKey: ["procurement-suppliers"],
    queryFn: posFetchSuppliers,
  });
  const suppliers = suppliersResult?.data ?? [];

  const { data: ingredientsRes } = useQuery({
    queryKey: ["ingredients"],
    queryFn: () => fetchIngredients({ status: "active" }),
  });
  const ingredients = Array.isArray(ingredientsRes?.data) ? ingredientsRes.data : [];

  const resetCreateForm = () => {
    setReference("");
    setExpectedAt("");
    setNotes("");
    setSelectedSuppliers([]);
    setLines([]);
  };

  const createMutation = useMutation({
    mutationFn: posCreateRFQ,
    onSuccess: () => {
      toast.success("RFQ created as draft.");
      void queryClient.invalidateQueries({ queryKey: ["procurement-rfqs"] });
      setIsCreateDialogOpen(false);
      resetCreateForm();
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to create RFQ.";
      toast.error(message);
    },
  });

  const addLine = () => {
    setLines((prevLines) => [...prevLines, { ingredientId: "", quantity: 1, description: "" }]);
  };

  const removeLine = (index: number) => {
    setLines((prevLines) => prevLines.filter((_, lineIndex) => lineIndex !== index));
  };

  const updateLine = (index: number, field: "ingredientId" | "quantity" | "description", value: string | number) => {
    setLines((prevLines) =>
      prevLines.map((line, lineIndex) => {
        if (lineIndex !== index) return line;
        return { ...line, [field]: value };
      }),
    );
  };

  const handleCreateRfq = () => {
    if (selectedSuppliers.length === 0) {
      toast.error("Choose at least one supplier.");
      return;
    }
    if (lines.length === 0) {
      toast.error("Add at least one item.");
      return;
    }
    if (lines.some((line) => !line.ingredientId)) {
      toast.error("All lines must have an ingredient selected.");
      return;
    }

    createMutation.mutate({
      reference,
      expectedAt: expectedAt || undefined,
      notes,
      suppliers: selectedSuppliers,
      lines: lines.map((line) => ({
        ingredientId: line.ingredientId,
        quantity: line.quantity,
        description: line.description,
      })),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-3xl tracking-tight">Request for Quotations</h1>
          <p className="text-muted-foreground">Solicit pricing from multiple suppliers before ordering.</p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> New RFQ
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>RFQ History</CardTitle>
          <CardDescription>View status and supplier responses.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Suppliers</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 5 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : rfqs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    <Empty className="border-0">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Receipt />
                        </EmptyMedia>
                        <EmptyTitle>No RFQs found</EmptyTitle>
                        <EmptyDescription>Create your first request for quotation to compare prices.</EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : (
                rfqs.map((rfq) => (
                  <TableRow key={rfq._id}>
                    <TableCell className="font-medium">{rfq.reference || rfq._id.slice(-6)}</TableCell>
                    <TableCell>{Array.isArray(rfq.suppliers) ? rfq.suppliers.length : 0} suppliers</TableCell>
                    <TableCell>{rfq.lines?.length || 0} lines</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {rfq.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/dashboard/procurement/rfq/${rfq._id}`}>View / Edit</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog
        open={isCreateDialogOpen}
        onOpenChange={(open) => {
          setIsCreateDialogOpen(open);
          if (!open) resetCreateForm();
        }}
      >
        <DialogContent className="w-[min(1100px,95vw)]! max-w-none! gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle className="text-lg">New RFQ</DialogTitle>
            <DialogDescription>Draft a request for quotation to send to suppliers.</DialogDescription>
          </DialogHeader>

          <div className="max-h-[calc(90vh-132px)] space-y-6 overflow-y-auto px-6 py-5">
            <div className="space-y-4">
              <Card className="min-w-0">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">General Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-rfq-ref">Reference (Internal)</Label>
                    <Input
                      id="new-rfq-ref"
                      value={reference}
                      onChange={(event) => setReference(event.target.value)}
                      placeholder="e.g. Q4-TOMATO-2026"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-rfq-expected">Expected By</Label>
                    <DatePicker
                      id="new-rfq-expected"
                      value={expectedAt}
                      onValueChange={setExpectedAt}
                      placeholder="Optional"
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-rfq-notes">Notes to Suppliers</Label>
                    <Textarea
                      id="new-rfq-notes"
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="Specific requirements, quality standards, etc."
                      className="min-h-[96px]"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="min-w-0">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Invite Suppliers</CardTitle>
                  <CardDescription>Select suppliers to send this request to.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex min-h-10 flex-wrap gap-2">
                    {selectedSuppliers.map((supplierId) => {
                      const supplier = suppliers.find((row) => row._id === supplierId);
                      return (
                        <Button
                          key={supplierId}
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            setSelectedSuppliers((prevSuppliers) =>
                              prevSuppliers.filter((currentSupplierId) => currentSupplierId !== supplierId),
                            )
                          }
                        >
                          {supplier?.name || supplierId}
                          <Plus className="ml-2 h-3 w-3 rotate-45" />
                        </Button>
                      );
                    })}
                  </div>
                  <Select
                    onValueChange={(supplierId) => {
                      if (!selectedSuppliers.includes(supplierId)) {
                        setSelectedSuppliers((prevSuppliers) => [...prevSuppliers, supplierId]);
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Add supplier..." />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers
                        .filter((supplier) => !selectedSuppliers.includes(supplier._id))
                        .map((supplier) => (
                          <SelectItem key={supplier._id} value={supplier._id}>
                            {supplier.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-base">Items Needed</CardTitle>
                  <CardDescription>Define the quantities for each ingredient.</CardDescription>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addLine}>
                  <Plus className="mr-2 h-4 w-4" /> Add Item
                </Button>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-md border">
                  <Table className="min-w-[760px]">
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead>Ingredient</TableHead>
                        <TableHead className="w-[140px]">Quantity</TableHead>
                        <TableHead>Description / Spec</TableHead>
                        <TableHead className="w-[60px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="h-24 text-center text-muted-foreground italic">
                            Add items to request prices.
                          </TableCell>
                        </TableRow>
                      ) : (
                        lines.map((line, index) => (
                          <TableRow key={`${line.ingredientId}-${index}`}>
                            <TableCell>
                              <Select
                                value={line.ingredientId}
                                onValueChange={(value) => updateLine(index, "ingredientId", value)}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select ingredient..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {ingredients.map((ingredient) => (
                                    <SelectItem key={ingredient._id} value={ingredient._id}>
                                      {ingredient.name} ({ingredient.unit})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min={0}
                                step={0.01}
                                value={line.quantity}
                                onChange={(event) => updateLine(index, "quantity", Number(event.target.value))}
                                className="text-right tabular-nums"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={line.description}
                                onChange={(event) => updateLine(index, "description", event.target.value)}
                                placeholder="Grade A, fresh, etc."
                              />
                            </TableCell>
                            <TableCell>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => removeLine(index)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>

          <DialogFooter className="border-t px-6 py-4">
            <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleCreateRfq} disabled={createMutation.isPending}>
              {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save as Draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
