"use client";

import { useEffect, useMemo, useRef } from "react";

import { LayoutGrid, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import type { PosMenuItem } from "@/lib/pos-catalog-api";
import { cn, formatCurrency } from "@/lib/utils";

interface PosProductGridProps {
  items: PosMenuItem[];
  selectedCategoryId: string;
  categories: any[];
  search: string;
  onSearchChange: (val: string) => void;
  onPickItem: (item: PosMenuItem) => void;
  locked: boolean;
  availabilityMap: Map<string, { canFulfill: boolean; estimatedPortions?: number | null; reason?: string }>;
  barcode: string;
  onBarcodeChange: (val: string) => void;
  onBarcodeSubmit: (val: string) => void;
  barcodeBusy: boolean;
}

export function PosProductGrid({
  items,
  selectedCategoryId,
  categories,
  search,
  onSearchChange,
  onPickItem,
  locked,
  availabilityMap,
  barcode,
  onBarcodeChange,
  onBarcodeSubmit,
  barcodeBusy,
}: PosProductGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, []);

  const categoryPath = useMemo(() => {
    if (selectedCategoryId === "all") return [];
    const path: any[] = [];
    let currId: string | null = selectedCategoryId;
    while (currId) {
      const cat = categories.find((c) => String(c._id) === currId);
      if (!cat) break;
      path.unshift(cat);
      const pid = typeof cat.parentCategory === "string" ? cat.parentCategory : cat.parentCategory?._id;
      currId = pid ? String(pid) : null;
    }
    return path;
  }, [categories, selectedCategoryId]);

  const filteredItems = useMemo(() => {
    let result = items;

    // If searching, we search globally across all categories for maximum speed
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((it) => it.name?.toLowerCase().includes(q) || it.sku?.toLowerCase().includes(q));
    } else if (selectedCategoryId !== "all") {
      const getChildIds = (catId: string): string[] => {
        const children = categories.filter((c) => {
          const pid = typeof c.parentCategory === "string" ? c.parentCategory : c.parentCategory?._id;
          return String(pid) === catId;
        });
        return [catId, ...children.flatMap((c) => getChildIds(String(c._id)))];
      };

      const targetIds = getChildIds(selectedCategoryId);

      result = result.filter((it) => {
        const cat = it.category;
        const id = typeof cat === "string" ? cat : cat?._id;
        return targetIds.includes(String(id));
      });
    }

    return result;
  }, [items, selectedCategoryId, categories, search]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden bg-zinc-950/20 p-4 md:p-6">
      {/* Search & Barcode Bar */}
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <Input
            placeholder="Search products..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-12 rounded-2xl border-zinc-800 bg-zinc-900/50 pl-12 text-sm text-zinc-200 ring-offset-zinc-950 placeholder:text-zinc-600 focus-visible:ring-emerald-500/20 md:h-14"
          />
        </div>
        <div className="relative w-full sm:w-64">
          <Input
            placeholder="Scan barcode..."
            value={barcode}
            onChange={(e) => onBarcodeChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onBarcodeSubmit(barcode);
              }
            }}
            disabled={barcodeBusy}
            className="h-12 rounded-2xl border-emerald-900/30 bg-emerald-900/10 text-emerald-100 text-sm placeholder:text-emerald-900 focus-visible:ring-emerald-500/20 md:h-14"
          />
          {barcodeBusy && (
            <div className="absolute top-1/2 right-4 -translate-y-1/2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            </div>
          )}
        </div>
      </div>

      {/* Breadcrumbs / Search Mode Indicator */}
      <div className="scrollbar-hide flex shrink-0 items-center gap-3 overflow-x-auto whitespace-nowrap font-black text-[10px] text-zinc-500 uppercase tracking-widest md:text-xs">
        {search.trim() ? (
          <div className="flex items-center gap-3 text-emerald-500">
            <Search className="size-3" />
            <span>Search Results</span>
            <span className="text-zinc-500 opacity-20">/</span>
            <span className="font-bold text-zinc-500">Global Catalog</span>
            <button 
              onClick={() => onSearchChange("")}
              className="ml-2 rounded-full bg-zinc-800 px-2 py-0.5 font-bold text-[9px] text-zinc-400 lowercase tracking-normal transition-colors hover:text-zinc-200"
            >
              clear
            </button>
          </div>
        ) : (
          <>
            <button
              className="flex items-center gap-2 px-1 py-1 transition-colors hover:text-zinc-300"
              onClick={() => onSearchChange("")}
            >
              <LayoutGrid className="size-3" />
              Catalog
            </button>
            {categoryPath.map((cat, idx) => (
              <div key={cat._id} className="flex items-center gap-3">
                <span className="opacity-20">/</span>
                <span
                  className={cn(
                    "py-1 transition-colors",
                    idx === categoryPath.length - 1 ? "text-emerald-500" : "cursor-pointer hover:text-zinc-300",
                  )}
                >
                  {cat.name}
                </span>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Scrollable Product Grid — native overflow for bulletproof scrolling */}
      <div 
        ref={scrollRef}
        className="scrollbar-hide -mx-4 min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 md:-mx-6 md:px-6"
      >
        <div className="pb-32">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-5 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] xl:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
            {filteredItems.map((item) => {
              const id = String(item._id);
              const avail = availabilityMap?.get(id);
              const canFulfill = avail?.canFulfill ?? true;

              return (
                <button
                  key={id}
                  disabled={locked || !canFulfill}
                  onClick={() => onPickItem(item)}
                  className={cn(
                    "group relative flex flex-col items-start gap-4 rounded-[2.5rem] p-4 transition-all duration-500 active:scale-[0.96]",
                    "border border-zinc-800/50 bg-zinc-900/40 shadow-xl hover:border-emerald-500/40 hover:bg-zinc-900/80 hover:shadow-emerald-950/10",
                    !canFulfill && "cursor-not-allowed border-red-900/20 grayscale-[0.5]",
                  )}
                >
                  {/* Product Image */}
                  <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[2rem] border border-zinc-800/50 bg-zinc-950">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="size-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
                      />
                    ) : (
                      <div className="flex size-full flex-col items-center justify-center gap-2 text-zinc-800">
                        <LayoutGrid className="size-6 opacity-20" />
                        <span className="font-black text-[8px] uppercase tracking-[0.2em] opacity-40">No Image</span>
                      </div>
                    )}

                    {/* Glossy Overlay on Hover */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

                    {/* Sold Out Blur Overlay */}
                    {!canFulfill && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-[3px]">
                        <div className="rounded-full border border-red-400/30 bg-red-600/90 px-4 py-2 font-black text-[9px] text-white uppercase tracking-[0.2em] shadow-2xl backdrop-blur-md">
                          Sold Out
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="w-full space-y-3 px-1 pb-1">
                    <div className="space-y-1">
                      <h4
                        className={cn(
                          "line-clamp-2 font-black text-sm text-zinc-100 uppercase leading-tight tracking-tight transition-colors group-hover:text-emerald-400",
                          !canFulfill && "text-zinc-500",
                        )}
                      >
                        {item.name}
                      </h4>
                      <p className="font-bold text-[10px] text-zinc-500 uppercase tracking-widest opacity-60">
                        {item.sku || "N/A"}
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <div className="flex flex-col">
                        <span className="mb-1 font-black text-[8px] text-zinc-600 uppercase leading-none tracking-tighter">Price</span>
                        <p
                          className={cn(
                            "font-black text-base text-emerald-500 tabular-nums leading-none tracking-tighter",
                            !canFulfill && "text-zinc-600",
                          )}
                        >
                          {formatCurrency(item.priceUsd || 0, { currency: "USD" }).split(".")[0]}
                          <span className="text-xs opacity-50">.{formatCurrency(item.priceUsd || 0, { currency: "USD" }).split(".")[1]}</span>
                        </p>
                      </div>

                      {avail && avail.estimatedPortions != null && canFulfill && (
                        <div
                          className={cn(
                            "rounded-full px-3 py-1.5 font-black text-[8px] uppercase tracking-widest shadow-lg",
                            avail.estimatedPortions <= 5
                              ? "bg-amber-500/10 text-amber-500 shadow-amber-950/20 ring-1 ring-amber-500/20"
                              : "bg-zinc-800/50 text-zinc-500 ring-1 ring-zinc-700/30",
                          )}
                        >
                          {avail.estimatedPortions} Left
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Sold out pattern */}
                  {!canFulfill && (
                    <div
                      className="pointer-events-none absolute inset-0 z-[5] rounded-[2.5rem] opacity-[0.03]"
                      style={{
                        backgroundImage:
                          "repeating-linear-gradient(45deg, #000, #000 10px, transparent 10px, transparent 20px)",
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {filteredItems.length === 0 && (
            <div className="flex flex-col items-center justify-center py-40 text-center">
              <div className="mb-6 flex size-20 items-center justify-center rounded-full border border-zinc-800/50 bg-zinc-900/50 shadow-inner">
                <Search className="size-8 text-zinc-800" />
              </div>
              <h3 className="font-black text-xl text-zinc-700 uppercase tracking-[0.2em]">Catalog Empty</h3>
              <p className="mt-3 max-w-[240px] font-black text-[10px] text-zinc-800 uppercase leading-relaxed tracking-widest">
                Try adjusting your search or category filters to find products.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
