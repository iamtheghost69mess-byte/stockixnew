"use client";

import { useState } from "react";

import Link from "next/link";

import { ExternalLink, Loader2, Package, ScanLine, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { normalizeInventoryBarcodeScan } from "@/lib/inventory-api";

function menuItemIdFromVariantRaw(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const menuItem = o.menuItem;
  if (typeof menuItem === "string" && /^[a-fA-F0-9]{24}$/.test(menuItem)) return menuItem;
  if (menuItem && typeof menuItem === "object" && "_id" in menuItem) {
    const id = (menuItem as { _id?: unknown })._id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

export default function InventoryBarcodeLookupPage() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<
    | { kind: "ingredient"; id: string; name?: string; sku?: string; balances?: unknown }
    | { kind: "menu_item_variant"; raw: unknown }
    | null
  >(null);

  async function runLookup() {
    const trimmed = code.trim();
    if (!trimmed) {
      toast.error("Enter a barcode or SKU.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const r = await normalizeInventoryBarcodeScan(trimmed);
      if (r.kind === "ingredient") {
        setResult({
          kind: "ingredient",
          id: r.id,
          name: r.name,
          sku: r.sku,
          balances: r.balances,
        });
      } else {
        setResult({ kind: "menu_item_variant", raw: r.raw });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lookup failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-semibold text-3xl tracking-tight">Barcode lookup</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          
          <Link href="/dashboard/inventory" className="text-primary underline-offset-4 hover:underline">
            Inventory
          </Link>{" "}
          quick adjust if you need to change stock.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ScanLine className="size-5" />
            Scan or type code
          </CardTitle>
          <CardDescription>Matches ingredient SKU first, then menu item variant SKU.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bc-code">Barcode / SKU</Label>
            <div className="flex gap-2">
              <Input
                id="bc-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Scan or paste"
                disabled={busy}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void runLookup();
                  }
                }}
              />
              <Button type="button" disabled={busy} onClick={() => void runLookup()} className="shrink-0 gap-2">
                {busy ? <Loader2 className="size-4 animate-spin" /> : <ScanLine className="size-4" />}
                Lookup
              </Button>
            </div>
          </div>

          {result?.kind === "ingredient" ? (
            <Card className="border-primary/20 bg-muted/30 shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Package className="size-4 text-primary" />
                  Ingredient
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="font-medium text-foreground">{result.name || result.id}</p>
                  {result.sku ? <p className="text-muted-foreground">SKU {result.sku}</p> : null}
                  <p className="mt-1 font-mono text-muted-foreground text-xs">{result.id}</p>
                </div>
                {Array.isArray(result.balances) && result.balances.length > 0 ? (
                  <div>
                    <p className="mb-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">Balances</p>
                    <ul className="space-y-1 rounded-md border bg-background/80 p-2 text-xs">
                      {(result.balances as Array<{ quantity?: number; location?: { name?: string } | null }>).map(
                        (b, i) => (
                          <li key={i} className="flex justify-between gap-2 tabular-nums">
                            <span className="truncate text-muted-foreground">{b.location?.name ?? "Location"}</span>
                            <span>{Number(b.quantity) || 0}</span>
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" asChild className="gap-1">
                    <Link href="/dashboard/ingredients">
                      <ExternalLink className="size-3.5" />
                      Ingredients list
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild className="gap-1">
                    <Link href="/dashboard/inventory">
                      <ExternalLink className="size-3.5" />
                      Inventory hub
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {result?.kind === "menu_item_variant" ? (
            <Card className="border-primary/20 bg-muted/30 shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <UtensilsCrossed className="size-4 text-primary" />
                  Menu item variant
                </CardTitle>
                <CardDescription>
                  Sellable SKU — use POS to ring up; links below are for catalog editing.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {(() => {
                  const raw = result.raw as Record<string, unknown> | null;
                  const name = typeof raw?.name === "string" ? raw.name : null;
                  const sku = typeof raw?.sku === "string" ? raw.sku : null;
                  const vid = typeof raw?._id === "string" ? raw._id : null;
                  const menuItemId = menuItemIdFromVariantRaw(result.raw);
                  return (
                    <>
                      {name ? <p className="font-medium text-foreground">{name}</p> : null}
                      {sku ? <p className="text-muted-foreground">SKU {sku}</p> : null}
                      {vid ? <p className="font-mono text-muted-foreground text-xs">{vid}</p> : null}
                      <Separator />
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" size="sm" asChild className="gap-1">
                          <Link href="/dashboard/menu-items">
                            <ExternalLink className="size-3.5" />
                            Menu items
                          </Link>
                        </Button>
                        {menuItemId ? (
                          <Button variant="outline" size="sm" asChild className="gap-1">
                            <Link href={`/dashboard/menu-items?highlight=${encodeURIComponent(menuItemId)}`}>
                              <ExternalLink className="size-3.5" />
                              Open item (id)
                            </Link>
                          </Button>
                        ) : null}
                      </div>
                    </>
                  );
                })()}
              </CardContent>
            </Card>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
