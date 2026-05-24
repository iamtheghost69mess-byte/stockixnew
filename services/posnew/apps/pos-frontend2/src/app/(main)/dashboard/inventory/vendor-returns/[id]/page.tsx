"use client";

import { useMemo, useState } from "react";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AccessGate } from "@/components/access-gate";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchIngredients, INGREDIENTS_QUERY_KEY, invalidateInventoryHubQueries } from "@/lib/inventory-api";
import { posCan } from "@/lib/pos-permissions";
import {
  posGetVendorReturn,
  posPostVendorReturn,
  posUpdateVendorReturnLines,
  VENDOR_RETURN_QUALITY_GRADES,
  type VendorReturnQualityGrade,
} from "@/lib/pos-vendor-return-api";
import { formatCurrency } from "@/lib/utils";
import { usePosAuthStore } from "@/stores/pos-auth-store";

function VendorReturnDetailPageContent() {
  const params = useParams();
  const id = params.id as string;
  const queryClient = useQueryClient();
  const router = useRouter();
  const permissions = usePosAuthStore((s) => s.user?.permissions ?? []);
  const canWrite = posCan(permissions, "backoffice.inventory.write");

  const [localLines, setLocalLines] = useState<
    {
      ingredientId: string;
      quantity: number;
      unitCost: number;
      reason: string;
      qualityGrade: VendorReturnQualityGrade;
    }[]
  >([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // 1. Fetch Data
  const {
    data: returnRes,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["vendor-return", id],
    queryFn: () => posGetVendorReturn(id),
    enabled: !!id,
  });
  const rtv = returnRes?.data;

  const { data: ingredientsRes } = useQuery({
    queryKey: INGREDIENTS_QUERY_KEY,
    queryFn: () => fetchIngredients({ status: "active" }),
  });
  const ingredients = Array.isArray(ingredientsRes?.data) ? ingredientsRes.data : [];

  // Initialize local lines from server
  useMemo(() => {
    if (rtv?.lines && localLines.length === 0 && !hasUnsavedChanges) {
      setLocalLines(
        rtv.lines.map((l: any) => ({
          ingredientId: typeof l.ingredient === "object" ? l.ingredient._id : l.ingredient,
          quantity: l.quantity,
          unitCost: l.unitCost,
          reason: l.reason || "",
          qualityGrade: (l.qualityGrade as VendorReturnQualityGrade) || "other",
        })),
      );
    }
  }, [rtv?.lines]);

  // 2. Mutations
  const updateMutation = useMutation({
    mutationFn: () =>
      posUpdateVendorReturnLines(
        id,
        localLines.map((l) => ({
          ingredient: l.ingredientId,
          quantity: l.quantity,
          unitCost: l.unitCost,
          reason: l.reason,
          qualityGrade: l.qualityGrade,
        })),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendor-return", id] });
      toast.success("Return lines saved.");
      setHasUnsavedChanges(false);
    },
    onError: (err: any) => toast.error(err.message || "Failed to save lines."),
  });

  const postMutation = useMutation({
    mutationFn: () => posPostVendorReturn(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendor-return", id] });
      queryClient.invalidateQueries({ queryKey: ["vendor-returns"] });
      invalidateInventoryHubQueries(queryClient);
      toast.success("Vendor return posted. Stock updated.");
      router.push("/dashboard/inventory/vendor-returns");
    },
    onError: (err: any) => toast.error(err.message || "Failed to post return."),
  });

  // 3. Handlers
  const addLine = () => {
    setLocalLines((prev) => [
      ...prev,
      { ingredientId: "", quantity: 1, unitCost: 0, reason: "", qualityGrade: "other" },
    ]);
    setHasUnsavedChanges(true);
  };

  const removeLine = (idx: number) => {
    setLocalLines((prev) => prev.filter((_, i) => i !== idx));
    setHasUnsavedChanges(true);
  };

  const updateLine = (idx: number, patch: any) => {
    setLocalLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
    setHasUnsavedChanges(true);
  };

  const isDraft = rtv?.status === "draft";
  const canEditDraft = Boolean(isDraft && canWrite);

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !rtv) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6">
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>Could not load vendor return session.</AlertDescription>
        </Alert>
        <Button asChild variant="outline">
          <Link href="/dashboard/inventory/vendor-returns">Back to list</Link>
        </Button>
      </div>
    );
  }

  const totalValue = localLines.reduce((acc, l) => acc + l.quantity * l.unitCost, 0);

  return (
    <div className="space-y-6">
      {isDraft && !canWrite ? (
        <Alert>
          <AlertTitle>View only</AlertTitle>
          <AlertDescription>
            This return is a draft. Editing, saving lines, and posting require{" "}
            <span className="font-mono text-xs">backoffice.inventory.write</span>.
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Button variant="ghost" size="sm" className="-ml-2 h-8 gap-1" asChild>
            <Link href="/dashboard/inventory/vendor-returns">
              <ArrowLeft className="h-4 w-4" />
              All Returns
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-mono font-bold text-2xl uppercase tracking-widest">{rtv.returnNumber}</h1>
            <Badge variant="outline" className="capitalize">
              {rtv.status}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            Supplier: <span className="font-medium text-foreground">{(rtv.supplier as any).name}</span> • Warehouse:{" "}
            <span className="font-medium text-foreground">{(rtv.location as any).name}</span>
          </p>
        </div>
        {canEditDraft ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => updateMutation.mutate()}
              disabled={updateMutation.isPending || !hasUnsavedChanges}
            >
              <Save className="mr-2 h-4 w-4" />
              Save Draft
            </Button>
            <Button
              onClick={() => {
                if (confirm("Finalize this return and deduct stock?")) {
                  postMutation.mutate();
                }
              }}
              disabled={postMutation.isPending || updateMutation.isPending}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Finalize & Post
            </Button>
          </div>
        ) : null}
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="space-y-1">
              <CardTitle>Return Items</CardTitle>
              <CardDescription>List ingredients being returned to the vendor.</CardDescription>
            </div>
            {canEditDraft ? (
              <Button size="sm" onClick={addLine}>
                <Plus className="mr-2 h-4 w-4" /> Add Item
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[260px]">Ingredient</TableHead>
                  <TableHead className="w-[100px]">Qty</TableHead>
                  <TableHead className="w-[130px]">Unit Cost</TableHead>
                  <TableHead className="w-[160px]">Quality grade</TableHead>
                  <TableHead>Reason</TableHead>
                  {canEditDraft ? <TableHead className="w-[50px]" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {localLines.map((line, idx) => {
                  const ing = ingredients.find((i) => i._id === line.ingredientId);
                  return (
                    <TableRow key={idx}>
                      <TableCell>
                        <Select
                          disabled={!canEditDraft}
                          value={line.ingredientId}
                          onValueChange={(v) => updateLine(idx, { ingredientId: v })}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue placeholder="Select ingredient" />
                          </SelectTrigger>
                          <SelectContent>
                            {ingredients.map((i) => (
                              <SelectItem key={i._id} value={i._id}>
                                {i.name} ({i.unit})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          className="h-8"
                          disabled={!canEditDraft}
                          value={line.quantity}
                          onChange={(e) => updateLine(idx, { quantity: parseFloat(e.target.value) || 0 })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          className="h-8"
                          disabled={!canEditDraft}
                          value={line.unitCost}
                          onChange={(e) => updateLine(idx, { unitCost: parseFloat(e.target.value) || 0 })}
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          disabled={!canEditDraft}
                          value={line.qualityGrade}
                          onValueChange={(v) => updateLine(idx, { qualityGrade: v as VendorReturnQualityGrade })}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {VENDOR_RETURN_QUALITY_GRADES.map((g) => (
                              <SelectItem key={g.value} value={g.value}>
                                {g.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-8"
                          disabled={!canEditDraft}
                          placeholder="Free-form note"
                          value={line.reason}
                          onChange={(e) => updateLine(idx, { reason: e.target.value })}
                        />
                      </TableCell>
                      {canEditDraft ? (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => removeLine(idx)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
                {localLines.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={canEditDraft ? 6 : 5} className="h-24 text-center text-muted-foreground">
                      No items added yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Items:</span>
                <span className="font-medium">{localLines.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Value:</span>
                <span className="font-bold text-primary">{formatCurrency(totalValue)}</span>
              </div>
              <div className="pt-2">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Created By</p>
                <p className="text-sm font-medium">System Admin</p>
              </div>
              {rtv.vendorCreditNoteRef && (
                <div className="pt-2">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Credit Note Ref</p>
                  <p className="text-sm font-mono">{rtv.vendorCreditNoteRef}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{rtv.notes || "No extra notes."}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function VendorReturnDetailPage() {
  return (
    <AccessGate permission="backoffice.inventory.read">
      <VendorReturnDetailPageContent />
    </AccessGate>
  );
}
