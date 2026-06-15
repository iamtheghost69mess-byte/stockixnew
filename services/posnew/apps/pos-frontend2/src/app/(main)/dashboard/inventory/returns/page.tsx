"use client";

import { useState } from "react";

import Link from "next/link";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, PackagePlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  fetchIngredients,
  fetchLocationsList,
  INGREDIENTS_QUERY_KEY,
  type IngredientRecord,
  invalidateInventoryHubQueries,
  MENU_INVENTORY_AVAILABILITY_QUERY_KEY,
  normalizeLocationsQueryData,
  postInventoryReturn,
} from "@/lib/inventory-api";

export default function InventoryCustomerReturnsPage() {
  const queryClient = useQueryClient();
  const [ingredientId, setIngredientId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [note, setNote] = useState("");

  const ingredientsQuery = useQuery({
    queryKey: [...INGREDIENTS_QUERY_KEY, "returns", "active"],
    queryFn: async () => {
      const res = await fetchIngredients({ status: "active" });
      return Array.isArray(res.data) ? (res.data as IngredientRecord[]) : [];
    },
  });
  const locationsQuery = useQuery({
    queryKey: ["locations"],
    queryFn: fetchLocationsList,
  });

  const ingredients = ingredientsQuery.data ?? [];
  const locations = normalizeLocationsQueryData(locationsQuery.data);

  const returnMutation = useMutation({
    mutationFn: async () => {
      const qty = Number(quantity);
      if (!ingredientId) throw new Error("Select an ingredient.");
      if (!Number.isFinite(qty) || qty <= 0) throw new Error("Quantity must be a positive number.");
      const ucRaw = unitCost.trim();
      const uc = ucRaw === "" ? undefined : Number(ucRaw);
      if (uc != null && (!Number.isFinite(uc) || uc < 0)) {
        throw new Error("Unit cost must be empty or a non-negative number.");
      }
      return postInventoryReturn({
        ingredientId,
        quantity: qty,
        locationId: locationId || undefined,
        note: note.trim() || undefined,
        unitCost: uc,
      });
    },
    onSuccess: () => {
      toast.success("Return recorded; stock increased.");
      setQuantity("");
      setUnitCost("");
      setNote("");
      void queryClient.invalidateQueries({ queryKey: INGREDIENTS_QUERY_KEY });
      invalidateInventoryHubQueries(queryClient);
      void queryClient.invalidateQueries({ queryKey: MENU_INVENTORY_AVAILABILITY_QUERY_KEY });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not record return."),
  });

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="font-semibold text-3xl tracking-tight">Customer returns</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Restock inventory when sellable goods come back from customers. Uses{" "}
          <span className="font-mono text-xs">POST /api/inventory/returns</span> (same movement reason as POS restock).
          Managers and admins only.
        </p>
        <p className="mt-2 text-muted-foreground text-sm">
          <Link href="/dashboard/inventory" className="text-primary underline-offset-4 hover:underline">
            Inventory hub
          </Link>{" "}
          has the general <strong>Quick adjust</strong> tool if you need other reasons.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <PackagePlus className="size-5" />
            Record return
          </CardTitle>
          <CardDescription>Positive quantity adds stock at the chosen branch (or default location).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Ingredient</Label>
            {ingredientsQuery.isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <Select value={ingredientId || undefined} onValueChange={setIngredientId}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Select ingredient…" />
                </SelectTrigger>
                <SelectContent>
                  {ingredients.map((ing) => (
                    <SelectItem key={ing._id} value={ing._id}>
                      {ing.name || ing.sku || ing._id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label>Branch (optional)</Label>
            {locationsQuery.isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <Select
                value={locationId || "__default__"}
                onValueChange={(v) => setLocationId(v === "__default__" ? "" : v)}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Default for org" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">Default location</SelectItem>
                  {locations.map((loc) => (
                    <SelectItem key={loc._id} value={loc._id}>
                      {loc.name || loc.code || loc._id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="ret-qty">Quantity (stock units)</Label>
            <Input
              id="ret-qty"
              type="number"
              min={0}
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="e.g. 2"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ret-cost">Unit cost (optional)</Label>
            <Input
              id="ret-cost"
              type="number"
              min={0}
              step="any"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              placeholder="Leave empty to use ingredient average"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ret-note">Note (optional)</Label>
            <Textarea
              id="ret-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="RMA, receipt #, staff initials…"
              rows={3}
            />
          </div>

          <Button
            type="button"
            className="w-full sm:w-auto"
            disabled={returnMutation.isPending}
            onClick={() => void returnMutation.mutateAsync()}
          >
            {returnMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Apply return
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
