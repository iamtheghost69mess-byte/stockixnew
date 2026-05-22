"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  fetchIngredients,
  INGREDIENTS_QUERY_KEY,
  type IngredientRecord,
  normalizeInventoryBarcodeScan,
} from "@/lib/inventory-api";
import { cn } from "@/lib/utils";

export type PosRefundConfirmPayload = {
  note: string;
  restock: null | { ingredientId: string; quantity: number };
};

type PosRefundDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  busy: boolean;
  onConfirm: (payload: PosRefundConfirmPayload) => Promise<void>;
};

export function PosRefundDialog({ open, onOpenChange, orderId, busy, onConfirm }: PosRefundDialogProps) {
  const [note, setNote] = useState("");
  const [restock, setRestock] = useState(false);
  const [ingredientId, setIngredientId] = useState<string>("");
  const [quantity, setQuantity] = useState("1");
  const [filter, setFilter] = useState("");
  const [barcodeLookup, setBarcodeLookup] = useState("");
  const [scanBusy, setScanBusy] = useState(false);

  const { data: ingRes, isLoading: ingredientsLoading } = useQuery({
    queryKey: [...INGREDIENTS_QUERY_KEY, "pos-refund-dialog"] as const,
    queryFn: () => fetchIngredients({ status: "active" }),
    enabled: open,
    staleTime: 30_000,
  });
  const ingredients = useMemo(() => (Array.isArray(ingRes?.data) ? ingRes.data : []), [ingRes?.data]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return ingredients;
    return ingredients.filter((i) => {
      const name = (i.name || "").toLowerCase();
      const sku = (i.sku || "").toLowerCase();
      return name.includes(q) || sku.includes(q) || String(i._id).toLowerCase().includes(q);
    });
  }, [ingredients, filter]);

  const selected = useMemo(
    () => ingredients.find((i) => String(i._id) === ingredientId) ?? null,
    [ingredients, ingredientId],
  );

  useEffect(() => {
    if (!open) {
      setNote("");
      setRestock(false);
      setIngredientId("");
      setQuantity("1");
      setFilter("");
      setBarcodeLookup("");
    }
  }, [open]);

  const applyBarcode = useCallback(async () => {
    const code = barcodeLookup.trim();
    if (!code) {
      toast.error("Enter a barcode first.");
      return;
    }
    if (!navigator.onLine) {
      toast.error("Barcode lookup needs a network connection.");
      return;
    }
    setScanBusy(true);
    try {
      const result = await normalizeInventoryBarcodeScan(code);
      if (result.kind !== "ingredient") {
        toast.error("Scan did not resolve to an ingredient (menu variants are for selling, not restock).");
        return;
      }
      setIngredientId(result.id);
      toast.success(`Selected: ${result.name || "ingredient"}`);
      setBarcodeLookup("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Scan failed.");
    } finally {
      setScanBusy(false);
    }
  }, [barcodeLookup]);

  async function handleSubmit() {
    let restockPayload: PosRefundConfirmPayload["restock"] = null;
    if (restock) {
      if (!ingredientId || !/^[a-fA-F0-9]{24}$/.test(ingredientId)) {
        toast.error("Choose an ingredient to restock, or turn off restock.");
        return;
      }
      const q = Number(quantity);
      if (!Number.isFinite(q) || q <= 0) {
        toast.error("Enter a valid restock quantity.");
        return;
      }
      restockPayload = { ingredientId, quantity: q };
    }
    await onConfirm({ note: note.trim(), restock: restockPayload });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-hidden border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-zinc-50">Refund / cancel check</DialogTitle>
          <DialogDescription className="text-zinc-500">
            The check will be cancelled on the server. Optional restock posts a{" "}
            <span className="font-mono text-zinc-400">customer_return</span> movement (same as studio returns) at your
            scoped location when the API applies it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <div className="space-y-3">
            <Label htmlFor="refund-note" className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 px-1">
              Reason for Cancellation
            </Label>
            <Input
              id="refund-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Mistake, Customer change of mind"
              className="h-14 border-zinc-800 bg-zinc-900/50 px-4 text-sm font-bold text-white focus:ring-emerald-500/20 rounded-2xl shadow-inner border-zinc-700/50"
              disabled={busy}
            />
          </div>

          <div className="flex items-center gap-3 px-1">
            <Checkbox
              id="refund-restock"
              checked={restock}
              onCheckedChange={(v) => setRestock(v === true)}
              disabled={busy}
              className="size-5 rounded-md border-zinc-700 bg-zinc-900 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-500"
            />
            <Label htmlFor="refund-restock" className="cursor-pointer text-xs font-black text-zinc-400 uppercase tracking-widest">
              Record inventory restock
            </Label>
          </div>

          {restock ? (
            <div className="space-y-4 rounded-[2rem] border border-zinc-800 bg-zinc-900/30 p-5 animate-in fade-in zoom-in-95 duration-500">
              <div className="space-y-2">
                <Label className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Quick Scan Barcode</Label>
                <div className="flex gap-2">
                  <Input
                    value={barcodeLookup}
                    onChange={(e) => setBarcodeLookup(e.target.value)}
                    placeholder="Scan ingredient..."
                    className="h-11 border-zinc-800 bg-zinc-950/50 text-sm font-bold rounded-xl"
                    disabled={busy || scanBusy}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void applyBarcode();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-11 px-4 bg-zinc-800 hover:bg-zinc-700 text-[10px] font-black uppercase tracking-widest rounded-xl"
                    disabled={busy || scanBusy}
                    onClick={() => void applyBarcode()}
                  >
                    {scanBusy ? <Loader2 className="size-4 animate-spin" /> : "Apply"}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="refund-ing-filter" className="text-[9px] font-black uppercase tracking-widest text-zinc-600">
                  Manual Search
                </Label>
                <Input
                  id="refund-ing-filter"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Type name or SKU..."
                  className="h-11 border-zinc-800 bg-zinc-950/50 text-sm font-bold rounded-xl"
                  disabled={busy}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Inventory Items</Label>
                {ingredientsLoading ? (
                  <div className="flex items-center gap-2 text-[10px] text-zinc-600 font-bold uppercase tracking-widest py-4">
                    <Loader2 className="size-3 animate-spin" />
                    Loading...
                  </div>
                ) : (
                  <ScrollArea className="h-44 rounded-2xl border border-zinc-800 bg-zinc-950/50">
                    <div className="space-y-1 p-2">
                      {filtered.length === 0 ? (
                        <p className="px-2 py-8 text-center text-[10px] font-bold text-zinc-600 uppercase tracking-widest">No matching ingredients</p>
                      ) : (
                        filtered.slice(0, 80).map((row: IngredientRecord) => (
                          <button
                            key={row._id}
                            type="button"
                            disabled={busy}
                            onClick={() => setIngredientId(String(row._id))}
                            className={cn(
                              "w-full rounded-xl px-3 py-2.5 text-left transition-all duration-300",
                              String(row._id) === ingredientId
                                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-950/20"
                                : "text-zinc-400 hover:bg-zinc-900/80 hover:text-zinc-200",
                            )}
                          >
                            <div className="flex justify-between items-center">
                              <span className="text-[11px] font-black uppercase tracking-tight">{row.name || row._id}</span>
                              {row.sku && (
                                <span className={cn("text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-zinc-950/50", String(row._id) === ingredientId ? "text-white/60" : "text-zinc-600")}>
                                  {row.sku}
                                </span>
                              )}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                )}
                {selected && (
                  <div className="flex items-center gap-2 px-1 text-emerald-400 text-[10px] font-black uppercase tracking-widest animate-in slide-in-from-left-2">
                    <div className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Selected: {selected.name}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="refund-qty" className="text-[9px] font-black uppercase tracking-widest text-zinc-600">
                  Restock Quantity
                </Label>
                <Input
                  id="refund-qty"
                  type="number"
                  min={0.01}
                  step="any"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="h-11 border-zinc-800 bg-zinc-950/50 text-sm font-black text-white rounded-xl"
                  disabled={busy}
                />
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-3 sm:justify-end border-t border-zinc-800/50 pt-6 mt-2">
          <Button
            type="button"
            variant="ghost"
            className="h-12 text-zinc-500 hover:text-white hover:bg-zinc-900 uppercase text-[10px] font-black tracking-widest rounded-xl"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Go Back
          </Button>
          <Button
            type="button"
            className="h-12 min-w-[160px] bg-red-600 font-black text-white uppercase text-[10px] tracking-[0.2em] rounded-xl shadow-lg shadow-red-950/20 hover:bg-red-500 active:scale-[0.98] transition-all"
            disabled={busy}
            onClick={() => void handleSubmit()}
          >
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : "Cancel & Refund"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
