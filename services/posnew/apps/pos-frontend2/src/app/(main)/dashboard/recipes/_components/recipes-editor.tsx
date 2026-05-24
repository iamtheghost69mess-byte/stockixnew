"use client";

import { useEffect, useMemo, useState } from "react";

import { useSearchParams } from "next/navigation";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { BookOpen, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { DataTable } from "@/components/shared/data-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchIngredients, INGREDIENTS_QUERY_KEY } from "@/lib/inventory-api";
import { posFetchMenuItems, posFetchMenuItemVariants } from "@/lib/pos-catalog-api";
import {
  deleteRecipeByMenuItem,
  fetchRecipeByMenuItem,
  fetchRecipesList,
  RECIPES_QUERY_KEY,
  type RecipeRecord,
  upsertRecipe,
} from "@/lib/recipes-api";

type LineDraft = {
  clientKey: string;
  lineType: "ingredient" | "subMenuItem";
  refId: string;
  quantity: number;
  optional: boolean;
};

function emptyLine(): LineDraft {
  return {
    clientKey: crypto.randomUUID(),
    lineType: "ingredient",
    refId: "",
    quantity: 0,
    optional: false,
  };
}

function recordToLines(recipe: RecipeRecord | null): LineDraft[] {
  if (!recipe?.ingredients?.length) return [emptyLine()];
  return recipe.ingredients.map((row) => {
    if (row.ingredient) {
      const id =
        typeof row.ingredient === "object" && row.ingredient && "_id" in row.ingredient
          ? String(row.ingredient._id)
          : String(row.ingredient);
      return {
        clientKey: crypto.randomUUID(),
        lineType: "ingredient" as const,
        refId: id,
        quantity: Number(row.quantity) || 0,
        optional: !!row.optional,
      };
    }
    const sub = row.subMenuItem;
    const sid = typeof sub === "object" && sub && "_id" in sub && sub._id != null ? String(sub._id) : String(sub ?? "");
    return {
      clientKey: crypto.randomUUID(),
      lineType: "subMenuItem" as const,
      refId: sid,
      quantity: Number(row.quantity) || 0,
      optional: !!row.optional,
    };
  });
}

export function RecipesEditor() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const initialMenuId = searchParams.get("menuItemId") ?? "";
  const initialVariantId = searchParams.get("variantId") ?? "";
  const [selectedMenuId, setSelectedMenuId] = useState<string>("");
  /** Empty string = base menu-item recipe (not a variant BOM). */
  const [selectedVariantId, setSelectedVariantId] = useState<string>("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [recipesSearch, setRecipesSearch] = useState("");
  const [recipesPageIndex, setRecipesPageIndex] = useState(0);
  const [recipesPageSize, setRecipesPageSize] = useState(10);
  const [recipesSorting, setRecipesSorting] = useState<SortingState>([{ id: "menuItemName", desc: false }]);
  const [appliedInitialParams, setAppliedInitialParams] = useState(false);

  const menuQuery = useQuery({
    queryKey: ["menu-items", "recipe-editor"],
    queryFn: () => posFetchMenuItems(),
  });
  const menuItems = menuQuery.data ?? [];
  useEffect(() => {
    if (appliedInitialParams) return;
    if (!initialMenuId) {
      setAppliedInitialParams(true);
      return;
    }
    if (menuQuery.isLoading) return;
    const exists = menuItems.some((m) => m._id === initialMenuId);
    if (exists) {
      setSelectedMenuId(initialMenuId);
      setSelectedVariantId(initialVariantId);
    }
    setAppliedInitialParams(true);
  }, [appliedInitialParams, initialMenuId, initialVariantId, menuItems, menuQuery.isLoading]);

  const variantsQuery = useQuery({
    queryKey: ["menu-item-variants", selectedMenuId],
    queryFn: () => posFetchMenuItemVariants(selectedMenuId),
    enabled: Boolean(selectedMenuId),
  });
  const variants = variantsQuery.data ?? [];

  const ingredientsQuery = useQuery({
    queryKey: [...INGREDIENTS_QUERY_KEY, { status: "active" }],
    queryFn: () => fetchIngredients({ status: "active" }),
  });
  const ingredients = Array.isArray(ingredientsQuery.data?.data) ? ingredientsQuery.data.data : [];

  const listQuery = useQuery({
    queryKey: [...RECIPES_QUERY_KEY, "list", recipesPageIndex, recipesPageSize, recipesSearch],
    queryFn: () => fetchRecipesList({ page: recipesPageIndex + 1, limit: recipesPageSize, q: recipesSearch }),
  });
  const recipeIndex = Array.isArray(listQuery.data?.data) ? listQuery.data.data : [];
  const recipeTotal = Number(listQuery.data?.total) || recipeIndex.length;

  const recipeQuery = useQuery({
    queryKey: [...RECIPES_QUERY_KEY, "by-menu", selectedMenuId, selectedVariantId || "__base__"],
    queryFn: async () => {
      const res = await fetchRecipeByMenuItem(selectedMenuId, selectedVariantId ? selectedVariantId : null);
      return res.data ?? null;
    },
    enabled: Boolean(selectedMenuId),
  });

  useEffect(() => {
    if (!selectedMenuId) {
      setLines([emptyLine()]);
      return;
    }
    if (recipeQuery.isLoading) return;
    setLines(recordToLines(recipeQuery.data ?? null));
  }, [selectedMenuId, recipeQuery.data, recipeQuery.isLoading]);

  const selectedMenuLabel = useMemo(() => {
    const m = menuItems.find((x) => x._id === selectedMenuId);
    return m?.name ?? selectedMenuId;
  }, [menuItems, selectedMenuId]);

  const selectedVariantLabel = useMemo(() => {
    if (!selectedVariantId) return null;
    const v = variants.find((x) => x._id === selectedVariantId);
    return v?.variantName ?? v?.sku ?? selectedVariantId;
  }, [variants, selectedVariantId]);

  const saveMutation = useMutation({
    mutationFn: async (): Promise<RecipeRecord | undefined> => {
      if (!selectedMenuId) throw new Error("Select a menu item.");
      const ingredientsPayload = lines
        .filter((l) => l.refId.trim() !== "")
        .map((l) => ({
          quantity: l.quantity,
          optional: l.optional,
          ...(l.lineType === "ingredient" ? { ingredient: l.refId } : { subMenuItem: l.refId }),
        }));
      for (const row of lines) {
        if (row.refId.trim() === "") continue;
        if (Number.isNaN(row.quantity) || row.quantity < 0) {
          throw new Error("Each line needs a non-negative quantity.");
        }
      }
      const res = await upsertRecipe({
        menuItem: selectedMenuId,
        ...(selectedVariantId ? { menuItemVariant: selectedVariantId } : {}),
        ingredients: ingredientsPayload,
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success("Recipe saved.");
      void queryClient.invalidateQueries({ queryKey: RECIPES_QUERY_KEY });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not save recipe."),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedMenuId) throw new Error("Select a menu item.");
      await deleteRecipeByMenuItem(selectedMenuId, selectedVariantId ? selectedVariantId : null);
    },
    onSuccess: () => {
      toast.success("Recipe removed.");
      setDeleteOpen(false);
      void queryClient.invalidateQueries({ queryKey: RECIPES_QUERY_KEY });
      setLines([emptyLine()]);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not delete recipe."),
  });

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines((rows) => rows.map((r) => (r.clientKey === key ? { ...r, ...patch } : r)));
  }

  function removeLine(key: string) {
    setLines((rows) => (rows.length <= 1 ? [emptyLine()] : rows.filter((r) => r.clientKey !== key)));
  }

  const hasRecipe = Boolean(recipeQuery.data?._id);
  const recipeColumns: ColumnDef<RecipeRecord>[] = [
    {
      id: "menuItemName",
      header: "Menu item",
      cell: ({ row }) => {
        const menu = row.original.menuItem;
        const name = typeof menu === "object" && menu && "name" in menu ? menu.name : "—";
        return <span className="font-medium">{name}</span>;
      },
    },
    {
      id: "variantName",
      header: "Variant",
      cell: ({ row }) => {
        const variant = row.original.menuItemVariant;
        if (!variant) return "Base item";
        if (typeof variant === "object" && variant && "variantName" in variant) {
          return variant.variantName || "Variant";
        }
        return "Variant";
      },
    },
    {
      id: "lines",
      header: "Lines",
      cell: ({ row }) => <span className="tabular-nums">{row.original.ingredients?.length ?? 0}</span>,
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const mid =
          typeof row.original.menuItem === "object" && row.original.menuItem
            ? String(row.original.menuItem._id)
            : String(row.original.menuItem);
        const vid =
          row.original.menuItemVariant && typeof row.original.menuItemVariant === "object"
            ? String(row.original.menuItemVariant._id)
            : row.original.menuItemVariant
              ? String(row.original.menuItemVariant)
              : "";
        return (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedMenuId(mid);
              setSelectedVariantId(vid);
            }}
          >
            Edit
          </Button>
        );
      },
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 pb-8">
      <header className="space-y-2 border-b pb-6">
        <h1 className="font-semibold text-2xl tracking-tight md:text-3xl">Recipes</h1>
        <p className="max-w-2xl text-muted-foreground text-sm leading-relaxed">
          Bill of materials per menu item or <strong className="text-foreground">per sellable variant</strong> (SKU).
          Each component is either an <strong className="text-foreground">ingredient</strong> (stock unit) or a{" "}
          <strong className="text-foreground">nested menu item</strong> (sub-recipe). Saving requires backoffice access
          and an appropriate role.
        </p>
      </header>

      <div className="flex w-full flex-col gap-8">
        <Card className="overflow-hidden shadow-sm ring-1 ring-border/60">
          <CardHeader className="border-b bg-muted/30">
            <CardTitle className="flex items-center gap-2 text-lg">
              <BookOpen className="size-5 opacity-80" aria-hidden />
              Menu item and index
            </CardTitle>
            <CardDescription>Pick what you are editing, then search existing recipes if needed.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <div className="space-y-2">
              <Label htmlFor="recipe-menu-item" className="text-foreground">
                Menu item
              </Label>
              {menuQuery.isLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Select
                  value={selectedMenuId || undefined}
                  onValueChange={(v) => {
                    setSelectedMenuId(v);
                    setSelectedVariantId("");
                  }}
                >
                  <SelectTrigger id="recipe-menu-item" className="h-11 w-full">
                    <SelectValue placeholder="Select menu item…" />
                  </SelectTrigger>
                  <SelectContent>
                    {menuItems.map((m) => (
                      <SelectItem key={m._id} value={m._id}>
                        {m.name ?? m._id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {selectedMenuId && variants.length > 0 ? (
              <div className="space-y-2">
                <Label htmlFor="recipe-variant-scope" className="text-foreground">
                  Recipe scope
                </Label>
                <Select
                  value={selectedVariantId || "__base__"}
                  onValueChange={(v) => setSelectedVariantId(v === "__base__" ? "" : v)}
                >
                  <SelectTrigger id="recipe-variant-scope" className="h-11 w-full">
                    <SelectValue placeholder="Base item (all variants)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__base__">Base menu item (default BOM)</SelectItem>
                    {variants.map((v) => (
                      <SelectItem key={v._id} value={v._id}>
                        {v.variantName ?? v.sku ?? v._id}
                        {v.sku ? ` · ${v.sku}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Variant-specific BOMs override the base recipe for that SKU only.
                </p>
              </div>
            ) : null}

            <Separator />

            <div className="space-y-3">
              <div>
                <h2 className="font-semibold text-foreground text-sm">Recipes on file</h2>
                <p className="mt-0.5 text-muted-foreground text-xs">
                  Search and jump to an existing bill of materials.
                </p>
              </div>
              <DataTable
                columns={recipeColumns}
                data={recipeIndex}
                isLoading={listQuery.isLoading}
                emptyMessage="No recipes yet."
                searchPlaceholder="Search recipes..."
                searchValue={recipesSearch}
                onSearchValueChange={(value) => {
                  setRecipesSearch(value);
                  setRecipesPageIndex(0);
                }}
                pageIndex={recipesPageIndex}
                pageSize={recipesPageSize}
                totalRows={recipeTotal}
                onPageChange={setRecipesPageIndex}
                onPageSizeChange={(value) => {
                  setRecipesPageSize(value);
                  setRecipesPageIndex(0);
                }}
                sorting={recipesSorting}
                onSortingChange={setRecipesSorting}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden shadow-sm ring-1 ring-border/60">
          <CardHeader className="border-b bg-muted/30">
            <CardTitle className="text-lg">Bill of materials</CardTitle>
            <CardDescription>
              {selectedMenuId
                ? `Editing: ${selectedMenuLabel}${selectedVariantLabel ? ` · ${selectedVariantLabel}` : ""}`
                : "Select a menu item to edit components."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            {!selectedMenuId ? (
              <p className="rounded-lg border border-dashed bg-muted/20 px-4 py-8 text-center text-muted-foreground text-sm">
                Choose a menu item in the card above to edit its recipe.
              </p>
            ) : recipeQuery.isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Loading recipe…
              </div>
            ) : recipeQuery.isError ? (
              <Alert variant="destructive">
                <AlertTitle>Could not load recipe</AlertTitle>
                <AlertDescription>Check backoffice permissions and try again.</AlertDescription>
              </Alert>
            ) : (
              <>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Each block is one BOM line. Fields stack in reading order: type, then item, quantity, and whether the
                  line is optional.
                </p>
                <div className="flex flex-col gap-4">
                  {lines.map((line, lineIndex) => {
                    const qtyId = `recipe-qty-${line.clientKey}`;
                    const optId = `recipe-opt-${line.clientKey}`;
                    return (
                      <div
                        key={line.clientKey}
                        className="relative rounded-xl border border-border/80 bg-card p-4 shadow-xs ring-1 ring-border/40"
                      >
                        <div className="mb-4 flex items-start justify-between gap-3 pr-1">
                          <div>
                            <p className="font-medium text-foreground text-sm">Component {lineIndex + 1}</p>
                            <p className="text-muted-foreground text-xs">Define one ingredient or nested dish.</p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-9 shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => removeLine(line.clientKey)}
                            aria-label={`Remove component ${lineIndex + 1}`}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                        <div className="flex flex-col gap-4">
                          <div className="space-y-2">
                            <Label className="text-foreground">Line type</Label>
                            <Select
                              value={line.lineType}
                              onValueChange={(v) =>
                                updateLine(line.clientKey, {
                                  lineType: v as LineDraft["lineType"],
                                  refId: "",
                                })
                              }
                            >
                              <SelectTrigger className="h-11 w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="ingredient">Ingredient</SelectItem>
                                <SelectItem value="subMenuItem">Nested menu item</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-foreground">
                              {line.lineType === "ingredient" ? "Ingredient" : "Nested menu item"}
                            </Label>
                            {line.lineType === "ingredient" ? (
                              <Select
                                value={line.refId || undefined}
                                onValueChange={(v) => updateLine(line.clientKey, { refId: v })}
                              >
                                <SelectTrigger className="h-11 w-full">
                                  <SelectValue placeholder="Select ingredient…" />
                                </SelectTrigger>
                                <SelectContent>
                                  {ingredients.map((ing) => (
                                    <SelectItem key={ing._id} value={ing._id}>
                                      {ing.name ?? ing._id}
                                      {ing.unit ? ` (${ing.unit})` : ""}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Select
                                value={line.refId || undefined}
                                onValueChange={(v) => updateLine(line.clientKey, { refId: v })}
                              >
                                <SelectTrigger className="h-11 w-full">
                                  <SelectValue placeholder="Select menu item…" />
                                </SelectTrigger>
                                <SelectContent>
                                  {menuItems
                                    .filter((m) => m._id !== selectedMenuId)
                                    .map((m) => (
                                      <SelectItem key={m._id} value={m._id}>
                                        {m.name ?? m._id}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={qtyId} className="text-foreground">
                              Quantity
                            </Label>
                            <Input
                              id={qtyId}
                              type="number"
                              min={0}
                              step="0.0001"
                              className="h-11 font-mono tabular-nums"
                              value={line.quantity}
                              onChange={(e) => updateLine(line.clientKey, { quantity: Number(e.target.value) })}
                            />
                            <p className="text-muted-foreground text-xs">
                              Stock units for ingredients; scaling factor for nested items.
                            </p>
                          </div>
                          <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:items-center sm:gap-4">
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id={optId}
                                checked={line.optional}
                                onCheckedChange={(checked) => updateLine(line.clientKey, { optional: !!checked })}
                              />
                              <Label htmlFor={optId} className="cursor-pointer font-medium text-foreground text-sm">
                                Optional line
                              </Label>
                            </div>
                            <p className="text-muted-foreground text-xs sm:flex-1">
                              When enabled, this component may be omitted from strict availability checks depending on
                              your rules.
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <Separator />

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10 w-full gap-1.5 sm:w-auto"
                    onClick={() => setLines((rows) => [...rows, emptyLine()])}
                  >
                    <Plus className="size-4" />
                    Add component line
                  </Button>
                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 w-full sm:w-auto"
                      disabled={!hasRecipe || deleteMutation.isPending}
                      onClick={() => setDeleteOpen(true)}
                    >
                      Delete recipe
                    </Button>
                    <Button
                      type="button"
                      className="h-10 w-full min-w-[140px] sm:w-auto"
                      disabled={saveMutation.isPending}
                      onClick={() => void saveMutation.mutateAsync()}
                    >
                      {saveMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                      Save recipe
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete recipe?</DialogTitle>
            <DialogDescription>
              This removes the BOM for <strong>{selectedMenuLabel}</strong>
              {selectedVariantLabel ? ` (${selectedVariantLabel})` : ""}. Menu availability will treat the scope as
              having no recipe until you save a new one.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => void deleteMutation.mutateAsync()}
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
