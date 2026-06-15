"use client";

import { useEffect, useMemo, useState } from "react";

import Link from "next/link";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2, QrCode } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { fetchPublicMenuBranding, fetchVenueSelfOrderQrBlob, updatePublicMenuBranding } from "@/lib/guest-menu-api";
import { fetchLocationsList, type LocationRow, normalizeLocationsQueryData } from "@/lib/inventory-api";
import {
  type PosCategory,
  type PosMenuItem,
  posFetchCategories,
  posFetchMenuItems,
  posPatchCategory,
  posUpdateCategory,
  posUpdateMenuItem,
} from "@/lib/pos-catalog-api";
import { usePosAuthStore } from "@/stores/pos-auth-store";

function prettyLocation(loc: LocationRow) {
  const name = loc.name?.trim();
  const code = loc.code?.trim();
  if (name && code) return `${name} (${code})`;
  return name || code || "Location";
}

function compareCategoryRows(
  a: { sortOrder?: number; name?: string },
  b: { sortOrder?: number; name?: string },
): number {
  const orderDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  if (orderDiff !== 0) return orderDiff;
  return String(a.name ?? "").localeCompare(String(b.name ?? ""));
}

function normalizeCategoryId(menuItem: PosMenuItem): string {
  const category = menuItem.category;
  if (!category) return "";
  if (typeof category === "string") return category;
  return category._id ? String(category._id) : "";
}

function compareMenuItemRows(a: PosMenuItem, b: PosMenuItem, categoryOrderById: ReadonlyMap<string, number>): number {
  const aCategoryOrder = categoryOrderById.get(normalizeCategoryId(a)) ?? Number.MAX_SAFE_INTEGER;
  const bCategoryOrder = categoryOrderById.get(normalizeCategoryId(b)) ?? Number.MAX_SAFE_INTEGER;
  if (aCategoryOrder !== bCategoryOrder) return aCategoryOrder - bCategoryOrder;
  return String(a.name ?? "").localeCompare(String(b.name ?? ""));
}

export default function GuestMenuPage() {
  const queryClient = useQueryClient();
  const [locationId, setLocationId] = useState<string>("default");
  const [venueQrSrc, setVenueQrSrc] = useState<string>("");

  const orgSlug = usePosAuthStore((s) => s.user?.organization?.slug ?? "");
  const fetchMe = usePosAuthStore((s) => s.fetchMe);

  const [displayName, setDisplayName] = useState("");
  const [tagline, setTagline] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [accentColor, setAccentColor] = useState("#ca8a04");
  const [showPrices, setShowPrices] = useState(true);
  const [categoryNotes, setCategoryNotes] = useState<Record<string, string>>({});
  const [itemNotes, setItemNotes] = useState<Record<string, string>>({});

  const { data: locationsRaw, isLoading: locationsLoading } = useQuery({
    queryKey: ["locations"],
    queryFn: fetchLocationsList,
  });
  const locations = normalizeLocationsQueryData(locationsRaw);

  const { data: catalogSnapshot, isLoading: catalogLoading } = useQuery({
    queryKey: ["guest-menu-catalog-snapshot"],
    queryFn: async () => {
      const [categories, items] = await Promise.all([posFetchCategories(), posFetchMenuItems()]);
      return { categories, items };
    },
  });
  const sortedCategories = useMemo(
    () => [...(catalogSnapshot?.categories ?? [])].sort(compareCategoryRows),
    [catalogSnapshot?.categories],
  );
  const categorySortOrderById = useMemo(() => {
    const map = new Map<string, number>();
    sortedCategories.forEach((category, index) => {
      map.set(category._id, index);
    });
    return map;
  }, [sortedCategories]);
  const sortedItems = useMemo(
    () => [...(catalogSnapshot?.items ?? [])].sort((a, b) => compareMenuItemRows(a, b, categorySortOrderById)),
    [catalogSnapshot?.items, categorySortOrderById],
  );

  const brandingQuery = useQuery({
    queryKey: ["guest-branding", locationId],
    queryFn: async () => fetchPublicMenuBranding(locationId === "default" ? null : locationId),
  });

  useEffect(() => {
    fetchMe().catch(() => undefined);
  }, [fetchMe]);

  useEffect(() => {
    const b = brandingQuery.data?.data;
    setDisplayName(b?.displayName ?? "");
    setTagline(b?.tagline ?? "");
    setLogoUrl(b?.logoUrl ?? "");
    setAccentColor(b?.accentColor ?? "#ca8a04");
    setShowPrices(b?.showPrices !== false);
  }, [brandingQuery.data]);

  useEffect(() => {
    const categories = sortedCategories;
    const nextNotes: Record<string, string> = {};
    for (const category of categories) {
      nextNotes[category._id] = category.menuNote ?? "";
    }
    setCategoryNotes(nextNotes);
  }, [sortedCategories]);

  useEffect(() => {
    const nextNotes: Record<string, string> = {};
    for (const item of sortedItems) {
      nextNotes[item._id] = item.menuNote ?? "";
    }
    setItemNotes(nextNotes);
  }, [sortedItems]);

  const saveMutation = useMutation({
    mutationFn: updatePublicMenuBranding,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guest-branding", locationId] });
      toast.success("Guest menu branding saved.");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not save branding.");
    },
  });

  const saveCategoryNoteMutation = useMutation({
    mutationFn: ({ categoryId, menuNote }: { categoryId: string; menuNote: string }) =>
      (typeof posPatchCategory === "function" ? posPatchCategory : posUpdateCategory)(categoryId, { menuNote }),
    onSuccess: (_data, vars) => {
      setCategoryNotes((prev) => ({ ...prev, [vars.categoryId]: vars.menuNote }));
      queryClient.setQueryData(
        ["guest-menu-catalog-snapshot"],
        (prev: { categories?: Array<{ _id: string; menuNote?: string }>; items?: unknown[] } | undefined) => {
          if (!prev?.categories) return prev;
          return {
            ...prev,
            categories: prev.categories.map((category) =>
              category._id === vars.categoryId ? { ...category, menuNote: vars.menuNote } : category,
            ),
          };
        },
      );
      queryClient.invalidateQueries({ queryKey: ["guest-menu-catalog-snapshot"] });
      queryClient.invalidateQueries({ queryKey: ["public-menu"] });
      toast.success("Category note saved.");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not save category note.");
    },
  });

  const saveItemNoteMutation = useMutation({
    mutationFn: ({ itemId, menuNote }: { itemId: string; menuNote: string }) => posUpdateMenuItem(itemId, { menuNote }),
    onSuccess: (_data, vars) => {
      setItemNotes((prev) => ({ ...prev, [vars.itemId]: vars.menuNote }));
      queryClient.setQueryData(
        ["guest-menu-catalog-snapshot"],
        (
          prev:
            | {
                categories?: PosCategory[];
                items?: PosMenuItem[];
              }
            | undefined,
        ) => {
          if (!prev?.items) return prev;
          return {
            ...prev,
            items: prev.items.map((item) => (item._id === vars.itemId ? { ...item, menuNote: vars.menuNote } : item)),
          };
        },
      );
      queryClient.invalidateQueries({ queryKey: ["guest-menu-catalog-snapshot"] });
      queryClient.invalidateQueries({ queryKey: ["public-menu"] });
      toast.success("Item note saved.");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not save item note.");
    },
  });

  const venueQrMutation = useMutation({
    mutationFn: async (_options: { silent: boolean }) => fetchVenueSelfOrderQrBlob(),
    onSuccess: (blob, variables) => {
      if (venueQrSrc) URL.revokeObjectURL(venueQrSrc);
      setVenueQrSrc(URL.createObjectURL(blob));
      if (variables?.silent !== true) {
        toast.success("Venue menu QR generated.");
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not generate venue QR.");
    },
  });

  useEffect(
    () => () => {
      if (venueQrSrc) URL.revokeObjectURL(venueQrSrc);
    },
    [venueQrSrc],
  );

  useEffect(() => {
    if (!orgSlug) return;
    if (venueQrSrc) return;
    if (venueQrMutation.isPending) return;
    venueQrMutation.mutate({ silent: true });
  }, [orgSlug, venueQrMutation, venueQrSrc]);

  const venuePublicUrl = orgSlug ? `/self-order?org=${encodeURIComponent(orgSlug)}` : "";
  const previewRows = (catalogSnapshot?.items ?? []).slice(0, 6);
  const categoryCount = catalogSnapshot?.categories?.length ?? 0;
  const liveItemCount = catalogSnapshot?.items?.length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-3xl text-foreground tracking-tight">Guest menu</h1>
        <p className="mt-1 text-muted-foreground">
          Brand the guest-facing menu and share one permanent <strong>restaurant-wide</strong> QR code for customers to
          browse the menu.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Menu source</CardTitle>
          <CardDescription>
            The public menu is your whole-venue catalog: top-level categories, subcategories (child categories), and
            items. Edit structure in Categories and Menu items.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">Categories: {catalogLoading ? "..." : categoryCount}</Badge>
            <Badge variant="secondary">Menu items: {catalogLoading ? "..." : liveItemCount}</Badge>
            <Badge variant="outline">Source: POS menu data</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" className="gap-1">
              <Link href="/dashboard/categories">
                Categories
                <ExternalLink className="size-3.5" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="gap-1">
              <Link href="/dashboard/menu-items">
                Menu Items
                <ExternalLink className="size-3.5" />
              </Link>
            </Button>
          </div>
          {!catalogLoading && previewRows.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {previewRows.map((item) => (
                <div key={item._id} className="rounded-md border p-2 text-sm">
                  <p className="font-medium">{item.name || "Item"}</p>
                  <p className="font-mono text-muted-foreground text-xs">#{item._id.slice(-6)}</p>
                </div>
              ))}
            </div>
          ) : null}
          {!catalogLoading && categoryCount > 0 ? (
            <div className="space-y-6">
              <div className="space-y-3">
                <div>
                  <p className="font-medium text-sm">Category guest notes</p>
                  <p className="text-muted-foreground text-xs">Shown under each category on the customer menu.</p>
                </div>
                <div className="overflow-hidden rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableHead className="w-[180px]">Category</TableHead>
                        <TableHead>Guest note</TableHead>
                        <TableHead className="w-[120px] text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedCategories.map((category) => {
                        const value = categoryNotes[category._id] ?? "";
                        const isSaving =
                          saveCategoryNoteMutation.isPending &&
                          saveCategoryNoteMutation.variables?.categoryId === category._id;
                        const original = category.menuNote ?? "";
                        return (
                          <TableRow key={category._id}>
                            <TableCell className="font-medium">{category.name || "Category"}</TableCell>
                            <TableCell>
                              <Input
                                value={value}
                                onChange={(event) =>
                                  setCategoryNotes((prev) => ({ ...prev, [category._id]: event.target.value }))
                                }
                                placeholder="Add a note for guests (e.g. all items served with fries)..."
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={isSaving || value.trim() === original.trim()}
                                onClick={() =>
                                  saveCategoryNoteMutation.mutate({
                                    categoryId: category._id,
                                    menuNote: value,
                                  })
                                }
                                className="gap-2"
                              >
                                {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : null}
                                Save
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="font-medium text-sm">Item guest notes</p>
                  <p className="text-muted-foreground text-xs">
                    Use this for menu highlights like the Cheese Burger note (separate from description).
                  </p>
                </div>
                <div className="overflow-hidden rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableHead className="w-[180px]">Category</TableHead>
                        <TableHead className="w-[200px]">Item</TableHead>
                        <TableHead>Guest note</TableHead>
                        <TableHead className="w-[120px] text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedItems.map((item) => {
                        const value = itemNotes[item._id] ?? "";
                        const isSaving =
                          saveItemNoteMutation.isPending && saveItemNoteMutation.variables?.itemId === item._id;
                        const original = item.menuNote ?? "";
                        const categoryName =
                          typeof item.category === "string"
                            ? sortedCategories.find((cat) => cat._id === item.category)?.name || "Uncategorized"
                            : item.category?.name || "Uncategorized";
                        return (
                          <TableRow key={item._id}>
                            <TableCell className="text-muted-foreground text-sm">{categoryName}</TableCell>
                            <TableCell className="font-medium">{item.name || "Item"}</TableCell>
                            <TableCell>
                              <Textarea
                                value={value}
                                onChange={(event) =>
                                  setItemNotes((prev) => ({ ...prev, [item._id]: event.target.value }))
                                }
                                rows={2}
                                placeholder="Add a customer-facing note for this item..."
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={isSaving || value.trim() === original.trim()}
                                onClick={() =>
                                  saveItemNoteMutation.mutate({
                                    itemId: item._id,
                                    menuNote: value,
                                  })
                                }
                                className="gap-2"
                              >
                                {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : null}
                                Save
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Branding scope</CardTitle>
          <CardDescription>Use default branding for all locations, or override by specific location.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="gm-location">Branding location</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger id="gm-location" className="w-full" disabled={locationsLoading}>
                <SelectValue placeholder="Choose scope..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default (all locations)</SelectItem>
                {locations.map((loc) => (
                  <SelectItem key={loc._id} value={loc._id}>
                    {prettyLocation(loc)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="gm-display">Display name</Label>
            <Input
              id="gm-display"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Restaurant Name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gm-tagline">Tagline</Label>
            <Input
              id="gm-tagline"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="Fresh food every day"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gm-logo">Logo URL</Label>
            <Input
              id="gm-logo"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gm-accent">Accent color</Label>
            <Input
              id="gm-accent"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              placeholder="#ca8a04"
            />
          </div>
          <div className="flex items-end gap-3">
            <Switch id="gm-show-prices" checked={showPrices} onCheckedChange={setShowPrices} />
            <Label htmlFor="gm-show-prices">Show prices on guest menu</Label>
          </div>
          <div className="md:col-span-2">
            <Button
              onClick={() =>
                saveMutation.mutate({
                  location: locationId === "default" ? null : locationId,
                  displayName,
                  tagline,
                  logoUrl,
                  accentColor,
                  showPrices,
                })
              }
              disabled={saveMutation.isPending || brandingQuery.isLoading}
              className="gap-2"
            >
              {saveMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Save branding
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <QrCode className="size-5" />
            Guest Access Links
          </CardTitle>
          <CardDescription>Configure and preview the customer-facing menu link and QR code.</CardDescription>
        </CardHeader>
        <CardContent>
          <section className="space-y-4 rounded-lg border p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-base">Customer Menu QR</h3>
                <p className="text-muted-foreground text-sm">
                  Share one public QR code so customers can open and browse your menu.
                </p>
              </div>
              <Badge variant="outline">Public menu</Badge>
            </div>
            {orgSlug ? (
              <p className="text-muted-foreground text-sm">
                Venue slug: <span className="font-mono">{orgSlug}</span>
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">
                Organization slug not loaded. Refresh the page or sign in again to load the venue link.
              </p>
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={() => venueQrMutation.mutate({ silent: false })}
                disabled={!orgSlug || venueQrMutation.isPending}
                className="flex-1 gap-2"
              >
                {venueQrMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Refresh QR
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!venuePublicUrl}
                onClick={() => {
                  if (!venuePublicUrl) return;
                  window.open(venuePublicUrl, "_blank", "noopener,noreferrer");
                }}
                className="gap-1"
              >
                Open
                <ExternalLink className="size-3.5" />
              </Button>
            </div>
            {venuePublicUrl ? (
              <p className="text-muted-foreground text-xs">
                Public link: <span className="font-mono">{venuePublicUrl}</span>
              </p>
            ) : null}
            <div className="flex min-h-[220px] items-center justify-center rounded-lg border bg-muted/20 p-4">
              {venueQrSrc ? (
                <img src={venueQrSrc} alt="Venue menu QR code" className="mx-auto rounded-md border bg-white p-2" />
              ) : (
                <p className="text-muted-foreground text-sm">Loading your permanent menu QR code...</p>
              )}
            </div>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
