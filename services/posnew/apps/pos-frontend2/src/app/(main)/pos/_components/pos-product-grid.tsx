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
  }, [search]);

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
    <div className="flex h-full flex-col gap-4 p-4 md:p-6 overflow-hidden bg-zinc-950/20 min-h-0">
      {/* Search & Barcode Bar */}
      <div className="flex flex-col sm:flex-row gap-3 shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <Input
            placeholder="Search products..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-12 md:h-14 border-zinc-800 bg-zinc-900/50 pl-12 text-sm text-zinc-200 ring-offset-zinc-950 placeholder:text-zinc-600 focus-visible:ring-emerald-500/20 rounded-2xl"
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
            className="h-12 md:h-14 border-emerald-900/30 bg-emerald-900/10 text-sm text-emerald-100 placeholder:text-emerald-900 focus-visible:ring-emerald-500/20 rounded-2xl"
          />
          {barcodeBusy && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
              <div className="h-4 w-4 animate-spin border-2 border-emerald-500 border-t-transparent rounded-full" />
            </div>
          )}
        </div>
      </div>

      {/* Breadcrumbs / Search Mode Indicator */}
      <div className="flex items-center gap-3 text-[10px] md:text-xs font-black uppercase tracking-widest text-zinc-500 shrink-0 overflow-x-auto whitespace-nowrap scrollbar-hide">
        {search.trim() ? (
          <div className="flex items-center gap-3 text-emerald-500">
            <Search className="size-3" />
            <span>Search Results</span>
            <span className="opacity-20 text-zinc-500">/</span>
            <span className="text-zinc-500 font-bold">Global Catalog</span>
            <button 
              onClick={() => onSearchChange("")}
              className="ml-2 px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors lowercase font-bold tracking-normal text-[9px]"
            >
              clear
            </button>
          </div>
        ) : (
          <>
            <button
              className="hover:text-zinc-300 transition-colors py-1 px-1 flex items-center gap-2"
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
                    "transition-colors py-1",
                    idx === categoryPath.length - 1 ? "text-emerald-500" : "hover:text-zinc-300 cursor-pointer",
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
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden -mx-4 px-4 md:-mx-6 md:px-6 scrollbar-hide"
      >
        <div className="pb-32">
          <div className="grid gap-5 grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] xl:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
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
                    "bg-zinc-900/40 border border-zinc-800/50 hover:bg-zinc-900/80 hover:border-emerald-500/40 shadow-xl hover:shadow-emerald-950/10",
                    !canFulfill && "cursor-not-allowed border-red-900/20 grayscale-[0.5]",
                  )}
                >
                  {/* Product Image */}
                  <div className="aspect-[4/3] w-full rounded-[2rem] bg-zinc-950 border border-zinc-800/50 overflow-hidden relative">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="size-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out"
                      />
                    ) : (
                      <div className="size-full flex flex-col items-center justify-center text-zinc-800 gap-2">
                        <LayoutGrid className="size-6 opacity-20" />
                        <span className="font-black text-[8px] uppercase tracking-[0.2em] opacity-40">No Image</span>
                      </div>
                    )}

                    {/* Glossy Overlay on Hover */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                    {/* Sold Out Blur Overlay */}
                    {!canFulfill && (
                      <div className="absolute inset-0 bg-zinc-950/70 backdrop-blur-[3px] z-10 flex items-center justify-center p-4">
                        <div className="rounded-full bg-red-600/90 text-white text-[9px] font-black uppercase tracking-[0.2em] px-4 py-2 shadow-2xl border border-red-400/30 backdrop-blur-md">
                          Sold Out
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="w-full space-y-3 px-1 pb-1">
                    <div className="space-y-1">
                      <h4
                        className={cn(
                          "font-black text-zinc-100 text-sm leading-tight uppercase tracking-tight group-hover:text-emerald-400 transition-colors line-clamp-2",
                          !canFulfill && "text-zinc-500",
                        )}
                      >
                        {item.name}
                      </h4>
                      <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest opacity-60">
                        {item.sku || "N/A"}
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <div className="flex flex-col">
                        <span className="text-[8px] font-black text-zinc-600 uppercase tracking-tighter leading-none mb-1">Price</span>
                        <p
                          className={cn(
                            "text-base font-black text-emerald-500 tabular-nums leading-none tracking-tighter",
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
                            "rounded-full px-3 py-1.5 text-[8px] font-black uppercase tracking-widest shadow-lg",
                            avail.estimatedPortions <= 5
                              ? "bg-amber-500/10 text-amber-500 ring-1 ring-amber-500/20 shadow-amber-950/20"
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
                      className="absolute inset-0 z-[5] opacity-[0.03] pointer-events-none rounded-[2.5rem]"
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
              <div className="size-20 rounded-full bg-zinc-900/50 flex items-center justify-center mb-6 border border-zinc-800/50 shadow-inner">
                <Search className="size-8 text-zinc-800" />
              </div>
              <h3 className="text-xl font-black text-zinc-700 uppercase tracking-[0.2em]">Catalog Empty</h3>
              <p className="text-[10px] text-zinc-800 mt-3 font-black uppercase tracking-widest max-w-[240px] leading-relaxed">
                Try adjusting your search or category filters to find products.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
