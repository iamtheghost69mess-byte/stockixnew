import type React from "react";

import { Link2, Pencil, Trash2 } from "lucide-react";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

export type ResourceField = {
  key: string;
  label: string;
  type: "text" | "badge" | "date" | "link" | "money" | "switch" | "progress" | "image" | "custom";
  /** Header and cell text alignment (matches flex `justify-end` toolbars when `end`). */
  align?: "start" | "center" | "end";
  href?: (row: any) => string;
  variant?: (val: any) => "default" | "outline" | "destructive" | "secondary";
  /** Optional ID for actions triggered by this field (e.g. toggling a switch). */
  actionId?: string;
  /** Optional: check if the switch should be disabled. */
  disabled?: (row: any) => boolean;
  /** Optional: custom render hook for complex cell content. */
  render?: (row: any, onAction?: (row: any, actionId: string, value: any) => void) => React.ReactNode;
};

export interface ResourceDefinition {
  id: string;
  label: string;
  permission: string;
  apiPath: string;
  schema: z.ZodType<any>;
  columns: ResourceField[];
  /**
   * Selects the array of data from the parsed response.
   */
  dataSelector: (parsed: any) => any[];
  /** Optional override for the search query parameter name (default: 'search'). */
  searchParam?: string;
}

function renderCategoryRevenueAccountCell(row: { revenueAccount?: unknown }) {
  const r = row.revenueAccount;
  const code = r && typeof r === "object" && "code" in r ? String((r as { code?: string }).code ?? "") : "";
  if (!code) {
    return <span className="text-muted-foreground text-sm">—</span>;
  }
  return <span className="font-mono text-xs">{code}</span>;
}

/**
 * Master Registry for Tenant-Side Metadata-Driven UI.
 */
export const ResourceRegistry: Record<string, ResourceDefinition> = {
  categories: {
    id: "categories",
    label: "Menu Categories",
    permission: "backoffice.catalog.read",
    apiPath: "/api/categories",
    schema: z.object({ success: z.boolean().optional(), data: z.array(z.any()) }),
    dataSelector: (p: any) => p.data || [],
    columns: [
      { key: "name", label: "Category Name", type: "text" },
      {
        key: "parentCategory",
        label: "Parent",
        type: "custom",
        render: (row: { parentCategory?: unknown }) => {
          const p = row.parentCategory;
          if (p && typeof p === "object" && "name" in p && typeof (p as { name?: string }).name === "string") {
            return <span className="text-muted-foreground text-sm">{(p as { name: string }).name}</span>;
          }
          return <span className="text-muted-foreground text-sm">—</span>;
        },
      },
      {
        key: "revenueAccount",
        label: "Revenue GL",
        type: "custom",
        render: renderCategoryRevenueAccountCell,
      },
      { key: "sortOrder", label: "Sort Order", type: "text" },
      {
        key: "actions",
        label: "Actions",
        type: "custom",
        align: "end",
        render: (row: any, onAction: any) => (
          <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" onClick={() => onAction?.(row, "edit", null)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive"
              onClick={() => onAction?.(row, "delete", null)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ],
  },
  menuItems: {
    id: "menuItems",
    label: "Menu Items",
    permission: "backoffice.catalog.read",
    apiPath: "/api/menu-items",
    schema: z.object({ success: z.boolean().optional(), data: z.array(z.any()) }),
    dataSelector: (p: any) => p.data || [],
    columns: [
      {
        key: "imageUrl",
        label: "Image",
        type: "image",
      },
      { key: "name", label: "Name", type: "text" },
      {
        key: "category",
        label: "Category",
        type: "custom",
        render: (row: any) => {
          const full =
            typeof row.categoryFullPath === "string" && row.categoryFullPath.trim() !== ""
              ? row.categoryFullPath.trim()
              : null;
          if (full) {
            return <Badge variant="outline">{full}</Badge>;
          }
          const cat = row.category;
          if (!cat || typeof cat !== "object") {
            const name = typeof cat === "string" ? "…" : "Uncategorized";
            return <Badge variant="outline">{name}</Badge>;
          }
          const leaf = (cat as { name?: string }).name || "Item";
          const par = (cat as { parentCategory?: { name?: string } | string | null }).parentCategory;
          const parentName = par && typeof par === "object" && typeof par.name === "string" ? par.name : null;
          const label = parentName ? `${parentName} › ${leaf}` : leaf;
          return <Badge variant="outline">{label}</Badge>;
        },
      },
      {
        key: "priceUsd",
        label: "Price",
        type: "custom",
        render: (row: any) => (
          <div className="flex flex-col gap-0.5 text-sm leading-tight tabular-nums">
            {(row.priceUsd || 0) > 0 && <span>{formatCurrency(row.priceUsd, { currency: "USD" })}</span>}
            {(row.priceLbp || 0) > 0 && (
              <span className="text-muted-foreground text-xs">
                {formatCurrency(row.priceLbp, { currency: "LBP", noDecimals: true })}
              </span>
            )}
            {!row.priceUsd && !row.priceLbp && <span>—</span>}
          </div>
        ),
      },
      {
        key: "isAvailable",
        label: "Status",
        type: "switch",
        actionId: "toggle-availability",
      },
      {
        key: "showOnPOS",
        label: "Show on POS",
        type: "custom",
        render: (row: any) => (
          <Badge variant={row.showOnPOS ? "default" : "secondary"}>
            {row.showOnPOS ? "Visible" : "Hidden"}
          </Badge>
        ),
      },
      {
        key: "actions",
        label: "Actions",
        type: "custom",
        align: "end",
        render: (row: any, onAction: any) => (
          <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" onClick={() => onAction?.(row, "edit", null)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-8 px-2"
              onClick={() => onAction?.(row, "open-recipe", null)}
            >
              Recipe
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-8 px-2"
              onClick={() => onAction?.(row, "variants", null)}
            >
              Variants
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive"
              onClick={() => onAction?.(row, "delete", null)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ],
  },
  ingredients: {
    id: "ingredients",
    label: "Inventory Ingredients",
    permission: "backoffice.inventory.read",
    apiPath: "/api/ingredients",
    schema: z.object({ success: z.boolean().optional(), data: z.array(z.any()) }),
    dataSelector: (p: any) => p.data || [],
    columns: [
      { key: "name", label: "Ingredient", type: "text" },
      { key: "sku", label: "SKU", type: "text" },
      {
        key: "category",
        label: "Category",
        type: "custom",
        render: (row: any) => {
          const cat = row.category;
          return <span>{typeof cat === "object" ? cat?.name : "—"}</span>;
        },
      },
      { key: "unit", label: "Unit", type: "badge", variant: () => "outline" },
      { key: "currentStock", label: "On hand", type: "text" },
      { key: "reorderThreshold", label: "Reorder at", type: "text" },
      {
        key: "status",
        label: "Status",
        type: "badge",
        variant: (v) => (v === "active" ? "default" : "secondary"),
      },
      {
        key: "actions",
        label: "Actions",
        type: "custom",
        align: "end",
        render: (row: any, onAction: any) => (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" onClick={() => onAction?.(row, "supplier-links", null)}>
              <Link2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => onAction?.(row, "edit", null)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive"
              onClick={() => onAction?.(row, "delete", null)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ],
  },
  ingredientCategories: {
    id: "ingredientCategories",
    label: "Ingredient Categories",
    permission: "backoffice.inventory.read",
    apiPath: "/api/ingredient-categories",
    schema: z.object({ success: z.boolean().optional(), data: z.array(z.any()) }),
    dataSelector: (p: any) => p.data || [],
    columns: [
      { key: "name", label: "Category", type: "text" },
      { key: "taxCode", label: "Tax Code", type: "text" },
      { key: "sortOrder", label: "Sort", type: "text" },
      {
        key: "actions",
        label: "Actions",
        type: "custom",
        align: "end",
        render: (row: any, onAction: any) => (
          <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" onClick={() => onAction?.(row, "edit", null)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive"
              onClick={() => onAction?.(row, "delete", null)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ],
  },
  locations: {
    id: "locations",
    label: "Locations (Branches)",
    permission: "backoffice.location.read",
    apiPath: "/api/locations",
    schema: z.object({ success: z.boolean().optional(), data: z.array(z.any()) }),
    dataSelector: (p: any) => p.data || [],
    columns: [
      { key: "name", label: "Branch Name", type: "text" },
      { key: "code", label: "Code", type: "text" },
      { key: "address", label: "Full Address", type: "text" },
      {
        key: "actions",
        label: "Actions",
        type: "custom",
        align: "end",
        render: (row: any, onAction: any) => (
          <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" onClick={() => onAction?.(row, "edit", null)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive"
              onClick={() => onAction?.(row, "delete", null)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ],
  },
};
