"use client";

import { Suspense, useMemo, useState } from "react";

import { useSearchParams } from "next/navigation";

import { useQuery } from "@tanstack/react-query";
import { Minus, Plus, ShoppingBag } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { fetchPublicMenu, type PublicCategory, type PublicMenuItem } from "@/lib/guest-menu-api";
import { formatMenuItemDualLines, resolveMenuItemDualPrices } from "@/lib/pos-menu-prices";
import { formatCurrency } from "@/lib/utils";

function categoryParentId(cat: PublicCategory, categoryIds: ReadonlySet<string>): string | null {
  const p = cat.parentCategory;
  if (p == null) return null;
  const pid = typeof p === "string" ? p : (p._id ?? null);
  if (!pid) return null;
  const id = String(pid);
  if (!categoryIds.has(id)) return null;
  return id;
}

function itemCategoryId(item: PublicMenuItem): string | null {
  const c = item.category;
  if (!c) return null;
  if (typeof c === "string") return c;
  if (typeof c === "object" && c._id != null) return String(c._id);
  return null;
}

function cmpCategory(a: PublicCategory, b: PublicCategory): number {
  const so = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  if (so !== 0) return so;
  return String(a.name ?? "").localeCompare(String(b.name ?? ""));
}

type CartEntry = {
  item: PublicMenuItem;
  quantity: number;
};

function computeDualTotals(item: PublicMenuItem, quantity: number): { usd: number; lbp: number } {
  const unit = resolveMenuItemDualPrices(item);
  return {
    usd: unit.priceUsd * quantity,
    lbp: unit.priceLbp * quantity,
  };
}

function formatDualTotals(usd: number, lbp: number): { primary: string; secondary: string | null } {
  if (usd > 0) {
    return {
      primary: formatCurrency(usd, { currency: "USD" }),
      secondary: lbp > 0 ? formatCurrency(lbp, { currency: "LBP", noDecimals: true }) : null,
    };
  }
  if (lbp > 0) {
    return {
      primary: formatCurrency(lbp, { currency: "LBP", noDecimals: true }),
      secondary: null,
    };
  }
  return { primary: "—", secondary: null };
}

function MenuItemPrice({
  item,
  showPrices,
  quantity,
}: Readonly<{ item: PublicMenuItem; showPrices: boolean; quantity?: number }>) {
  if (!showPrices) {
    return <span className="text-muted-foreground text-sm">Ask staff for price</span>;
  }
  if (quantity && quantity > 1) {
    const totals = computeDualTotals(item, quantity);
    const { primary, secondary } = formatDualTotals(totals.usd, totals.lbp);
    return (
      <span className="flex flex-col items-end font-semibold tabular-nums">
        <span>{primary}</span>
        {secondary ? <span className="font-normal text-muted-foreground text-xs">{secondary}</span> : null}
      </span>
    );
  }
  const { primary, secondary } = formatMenuItemDualLines(item);
  return (
    <span className="flex flex-col items-end font-semibold tabular-nums">
      <span>{primary}</span>
      {secondary ? <span className="font-normal text-muted-foreground text-xs">{secondary}</span> : null}
    </span>
  );
}

function MenuItemCards({
  items,
  showPrices,
  canAddToCart,
  cart,
  onAdd,
  onDecrement,
}: Readonly<{
  items: PublicMenuItem[];
  showPrices: boolean;
  canAddToCart: boolean;
  cart: ReadonlyMap<string, CartEntry>;
  onAdd: (item: PublicMenuItem) => void;
  onDecrement: (itemId: string) => void;
}>) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {items.map((item) => (
        <Card key={item._id} className={!item.isAvailable ? "opacity-70" : undefined}>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <CardTitle className="text-lg">{item.name || "Item"}</CardTitle>
              {!item.isAvailable ? (
                <Badge variant="secondary" className="bg-muted text-muted-foreground">
                  Out of Stock
                </Badge>
              ) : null}
            </div>
            {item.description ? <CardDescription>{item.description}</CardDescription> : null}
            {item.menuNote ? (
              <p className="text-muted-foreground text-xs">
                <span className="font-medium">Note:</span> {item.menuNote}
              </p>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-muted-foreground text-xs">#{item._id.slice(-6)}</span>
              <MenuItemPrice item={item} showPrices={showPrices} />
            </div>
            {canAddToCart ? (
              <div className="flex items-center justify-end gap-2">
                {cart.has(item._id) ? (
                  <>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="outline"
                      onClick={() => onDecrement(item._id)}
                      disabled={!item.isAvailable}
                    >
                      <Minus className="size-4" />
                    </Button>
                    <span className="w-6 text-center font-semibold text-sm">{cart.get(item._id)?.quantity ?? 0}</span>
                  </>
                ) : null}
                <Button type="button" size="sm" onClick={() => onAdd(item)} disabled={!item.isAvailable}>
                  <Plus className="size-4" />
                  Add
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function resolveMenuLinkMode(tableId: string, orgSlug: string): "table" | "org" | "none" {
  if (tableId) return "table";
  if (orgSlug) return "org";
  return "none";
}

function SelfOrderPageContent() {
  const search = useSearchParams();
  const tableId = search.get("table") ?? "";
  const orgSlug = search.get("org") ?? "";
  const [cartOpen, setCartOpen] = useState(false);
  const [cart, setCart] = useState<Record<string, CartEntry>>({});

  const mode = resolveMenuLinkMode(tableId, orgSlug);

  const query = useQuery({
    queryKey: ["public-menu", tableId || null, orgSlug || null],
    queryFn: () => {
      if (mode === "table") return fetchPublicMenu({ tableId });
      return fetchPublicMenu({ orgSlug });
    },
    enabled: mode === "table" || mode === "org",
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });

  const tree = useMemo(() => {
    const items = query.data?.items ?? [];
    const categories = query.data?.categories ?? [];
    const categoryIds = new Set(categories.map((c) => c._id));

    const itemsByCategory = new Map<string, PublicMenuItem[]>();
    const uncategorized: PublicMenuItem[] = [];
    for (const item of items) {
      const cid = itemCategoryId(item);
      if (cid && categoryIds.has(cid)) {
        const list = itemsByCategory.get(cid) ?? [];
        list.push(item);
        itemsByCategory.set(cid, list);
      } else {
        uncategorized.push(item);
      }
    }

    const childrenByParent = new Map<string, PublicCategory[]>();
    for (const cat of categories) {
      const parentId = categoryParentId(cat, categoryIds);
      if (parentId) {
        const list = childrenByParent.get(parentId) ?? [];
        list.push(cat);
        childrenByParent.set(parentId, list);
      }
    }
    for (const [, list] of childrenByParent) {
      list.sort(cmpCategory);
    }

    const roots = categories.filter((c) => categoryParentId(c, categoryIds) === null).sort(cmpCategory);

    const sections: {
      root: PublicCategory;
      directItems: PublicMenuItem[];
      subsections: { sub: PublicCategory; items: PublicMenuItem[] }[];
    }[] = [];

    for (const root of roots) {
      const directItems = itemsByCategory.get(root._id) ?? [];
      const childCats = childrenByParent.get(root._id) ?? [];
      const subsections = childCats
        .map((sub) => ({
          sub,
          items: itemsByCategory.get(sub._id) ?? [],
        }))
        .filter((s) => s.items.length > 0);
      if (directItems.length === 0 && subsections.length === 0) continue;
      sections.push({ root, directItems, subsections });
    }

    return { sections, uncategorized };
  }, [query.data]);

  const cartMap = useMemo(() => new Map(Object.entries(cart)), [cart]);
  const cartEntries = useMemo(() => Object.values(cart), [cart]);
  const canUseCart = mode === "table";
  const cartItemsCount = useMemo(() => cartEntries.reduce((acc, line) => acc + line.quantity, 0), [cartEntries]);
  const cartTotals = useMemo(() => {
    let totalUsd = 0;
    let totalLbp = 0;
    for (const line of cartEntries) {
      const totals = computeDualTotals(line.item, line.quantity);
      totalUsd += totals.usd;
      totalLbp += totals.lbp;
    }
    return formatDualTotals(totalUsd, totalLbp);
  }, [cartEntries]);

  const addToCart = (item: PublicMenuItem) => {
    if (!item.isAvailable) return;
    setCart((prev) => {
      const existing = prev[item._id];
      if (existing) {
        return {
          ...prev,
          [item._id]: {
            ...existing,
            quantity: existing.quantity + 1,
          },
        };
      }
      return {
        ...prev,
        [item._id]: { item, quantity: 1 },
      };
    });
  };

  const decrementFromCart = (itemId: string) => {
    setCart((prev) => {
      const existing = prev[itemId];
      if (!existing) return prev;
      if (existing.quantity <= 1) {
        const next = { ...prev };
        delete next[itemId];
        return next;
      }
      return {
        ...prev,
        [itemId]: {
          ...existing,
          quantity: existing.quantity - 1,
        },
      };
    });
  };

  if (mode === "none") {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>Menu link is incomplete</CardTitle>
            <CardDescription>
              Open this page from your venue or table QR code (<span className="font-mono">?org=…</span> or{" "}
              <span className="font-mono">?table=…</span>).
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">Loading menu...</CardContent>
        </Card>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>Could not load menu</CardTitle>
            <CardDescription>
              {query.error instanceof Error ? query.error.message : "Please try scanning the QR code again."}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const branding = query.data?.branding ?? {};
  const accent = branding.accentColor || "#ca8a04";
  const showPrices = branding.showPrices !== false;
  const { sections, uncategorized } = tree;
  const hasAnySection = sections.length > 0 || uncategorized.length > 0;
  const navCategories = sections.map((section) => section.root);

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-8">
        <header className="space-y-2 rounded-xl border p-5">
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt="Brand logo" className="h-12 w-auto object-contain" />
          ) : null}
          <h1 className="font-semibold text-3xl tracking-tight" style={{ color: accent }}>
            {branding.displayName?.trim() || "Menu"}
          </h1>
          {branding.tagline ? <p className="text-muted-foreground">{branding.tagline}</p> : null}
        </header>

        {navCategories.length > 0 ? (
          <div className="sticky top-0 z-20 rounded-lg border bg-background/95 p-2 backdrop-blur supports-backdrop-filter:bg-background/85">
            <ScrollArea className="w-full">
              <div className="flex w-max gap-2">
                {navCategories.map((cat) => (
                  <Button key={cat._id} asChild variant="outline" size="sm">
                    <a href={`#cat-${cat._id}`}>{cat.name || "Category"}</a>
                  </Button>
                ))}
              </div>
            </ScrollArea>
          </div>
        ) : null}

        {mode === "org" ? (
          <Card className="border-dashed bg-muted/30">
            <CardHeader className="py-4">
              <CardTitle className="text-base">Browse-only menu</CardTitle>
              <CardDescription>
                This is your restaurant menu QR. Ordering is handled by staff at your table.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        {hasAnySection ? (
          <>
            {sections.map(({ root, directItems, subsections }) => (
              <section id={`cat-${root._id}`} key={root._id} className="space-y-4 scroll-mt-24">
                <h2 className="font-semibold text-xl" style={{ color: root.color || accent }}>
                  {root.name || "Category"}
                </h2>
                {root.menuNote?.trim() ? <p className="text-muted-foreground text-sm">{root.menuNote.trim()}</p> : null}
                {directItems.length > 0 ? (
                  <MenuItemCards
                    items={directItems}
                    showPrices={showPrices}
                    canAddToCart={canUseCart}
                    cart={cartMap}
                    onAdd={addToCart}
                    onDecrement={decrementFromCart}
                  />
                ) : null}
                {subsections.map(({ sub, items: subItems }) => (
                  <div key={sub._id} className="space-y-3">
                    <h3 className="font-medium text-lg" style={{ color: sub.color || accent }}>
                      {sub.name || "Subcategory"}
                    </h3>
                    {sub.menuNote?.trim() ? (
                      <p className="text-muted-foreground text-sm">{sub.menuNote.trim()}</p>
                    ) : null}
                    <MenuItemCards
                      items={subItems}
                      showPrices={showPrices}
                      canAddToCart={canUseCart}
                      cart={cartMap}
                      onAdd={addToCart}
                      onDecrement={decrementFromCart}
                    />
                  </div>
                ))}
              </section>
            ))}
            {uncategorized.length > 0 ? (
              <section className="space-y-3">
                <h2 className="font-semibold text-xl" style={{ color: accent }}>
                  Other
                </h2>
                <MenuItemCards
                  items={uncategorized}
                  showPrices={showPrices}
                  canAddToCart={canUseCart}
                  cart={cartMap}
                  onAdd={addToCart}
                  onDecrement={decrementFromCart}
                />
              </section>
            ) : null}
          </>
        ) : (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              No menu items available right now.
            </CardContent>
          </Card>
        )}
      </div>

      {canUseCart && cartItemsCount > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 p-3 backdrop-blur supports-backdrop-filter:bg-background/90">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium text-sm">{cartItemsCount} item(s) in your order</p>
              {showPrices ? (
                <p className="truncate text-muted-foreground text-xs">
                  {cartTotals.primary}
                  {cartTotals.secondary ? ` • ${cartTotals.secondary}` : ""}
                </p>
              ) : (
                <p className="truncate text-muted-foreground text-xs">Prices hidden by venue</p>
              )}
            </div>
            <Button type="button" onClick={() => setCartOpen(true)}>
              <ShoppingBag className="size-4" />
              View Order
            </Button>
          </div>
        </div>
      ) : null}

      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent side="bottom" className="max-h-[85vh]">
          <SheetHeader>
            <SheetTitle>Your Order</SheetTitle>
            <SheetDescription>Keep browsing while your selections stay local on this device.</SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
            {cartEntries.length > 0 ? (
              cartEntries.map((line) => (
                <div key={line.item._id} className="space-y-3 rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-sm">{line.item.name || "Item"}</p>
                      {line.item.description ? (
                        <p className="line-clamp-2 text-muted-foreground text-xs">{line.item.description}</p>
                      ) : null}
                    </div>
                    {showPrices ? <MenuItemPrice item={line.item} showPrices={true} quantity={line.quantity} /> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="outline"
                      onClick={() => decrementFromCart(line.item._id)}
                    >
                      <Minus className="size-4" />
                    </Button>
                    <span className="w-8 text-center font-semibold text-sm">{line.quantity}</span>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="outline"
                      onClick={() => addToCart(line.item)}
                      disabled={!line.item.isAvailable}
                    >
                      <Plus className="size-4" />
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground text-sm">
                  No items selected yet.
                </CardContent>
              </Card>
            )}
          </div>
          <div className="space-y-3 border-t p-4">
            {showPrices ? (
              <div className="flex items-start justify-between gap-3">
                <span className="font-medium text-sm">Estimated total</span>
                <span className="text-right font-semibold text-sm">
                  <span className="block">{cartTotals.primary}</span>
                  {cartTotals.secondary ? (
                    <span className="block font-normal text-muted-foreground text-xs">{cartTotals.secondary}</span>
                  ) : null}
                </span>
              </div>
            ) : null}
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-muted-foreground text-sm">
              Your waiter will come to take your order
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default function SelfOrderPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-4xl p-6">
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">Loading menu…</CardContent>
          </Card>
        </div>
      }
    >
      <SelfOrderPageContent />
    </Suspense>
  );
}
