"use client";

import { useMemo, useState } from "react";

import { ChevronRight, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { PosCategory, PosMenuItem } from "@/lib/pos-catalog-api";
import { cn, formatCurrency } from "@/lib/utils";

interface PosMenuNavigatorProps {
  categories: PosCategory[];
  items: PosMenuItem[];
  onPickItem: (item: PosMenuItem) => void;
  locked: boolean;
}

export function PosMenuNavigator({ categories, items, onPickItem, locked }: PosMenuNavigatorProps) {
  const [selectedCatId, setSelectedCatId] = useState<string>("all");
  const [search, setSearch] = useState("");

  const filteredItems = useMemo(() => {
    let result = items;
    if (selectedCatId !== "all") {
      result = result.filter((it) => {
        const cat = it.category;
        const id = typeof cat === "string" ? cat : cat?._id;
        return String(id) === selectedCatId;
      });
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((it) => it.name?.toLowerCase().includes(q));
    }
    return result;
  }, [items, selectedCatId, search]);

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <Input
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-14 border-zinc-800 bg-zinc-950/50 pl-12 text-sm text-zinc-200 ring-offset-zinc-950 placeholder:text-zinc-600 focus-visible:ring-emerald-500/20"
        />
      </div>

      <div className="flex flex-1 gap-6 overflow-hidden">
        {/* Categories Sidebar */}
        <div className="w-56 shrink-0 border-zinc-800/50 border-r pr-6">
          <ScrollArea className="h-full">
            <div className="flex flex-col gap-1.5 pb-10">
              <button
                onClick={() => setSelectedCatId("all")}
                className={cn(
                  "flex h-12 items-center px-5 text-xs font-black uppercase tracking-widest transition-all rounded-xl",
                  selectedCatId === "all"
                    ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/20"
                    : "text-zinc-500 hover:bg-zinc-900/40 hover:text-zinc-300",
                )}
              >
                All Menu
              </button>
              {categories.map((cat) => (
                <button
                  key={cat._id}
                  onClick={() => setSelectedCatId(cat._id)}
                  className={cn(
                    "flex h-12 items-center px-5 text-xs font-black uppercase tracking-widest transition-all rounded-xl",
                    selectedCatId === cat._id
                      ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/20"
                      : "text-zinc-500 hover:bg-zinc-900/40 hover:text-zinc-300",
                  )}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Product Grid */}
        <div className="flex-1">
          <ScrollArea className="h-full">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-10">
              {filteredItems.map((it) => (
                <button
                  key={it._id}
                  disabled={locked || it.isAvailable === false}
                  onClick={() => onPickItem(it)}
                  className={cn(
                    "group relative flex min-h-[140px] flex-col justify-between overflow-hidden rounded-3xl border p-6 transition-all duration-300",
                    locked || it.isAvailable === false
                      ? "opacity-40 cursor-not-allowed border-zinc-900 bg-zinc-950"
                      : "cursor-pointer border-zinc-800 bg-zinc-900/40 hover:border-emerald-500/40 hover:bg-zinc-900/60 shadow-xl active:scale-95",
                  )}
                >
                  <div className="relative z-10 flex flex-col gap-2">
                    <h4 className="text-lg font-black tracking-tight text-white group-hover:text-emerald-400 transition-colors">
                      {it.name}
                    </h4>
                    <span className="text-sm font-bold text-emerald-500/90 tabular-nums">
                      {formatCurrency(it.priceUsd || 0, { currency: "USD" })}
                    </span>
                  </div>

                  <div className="absolute -bottom-12 -right-12 h-32 w-32 rounded-full bg-emerald-500/5 blur-3xl transition-all duration-500 group-hover:bg-emerald-500/10 group-hover:scale-125" />

                  {!it.isAvailable && (
                    <div className="absolute top-4 right-4 bg-red-500/10 text-red-500 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full ring-1 ring-red-500/20">
                      Sold Out
                    </div>
                  )}
                </button>
              ))}
            </div>
            {filteredItems.length === 0 && (
              <div className="flex flex-col items-center justify-center py-32 text-center opacity-30">
                <Search className="h-12 w-12 mb-4" />
                <p className="text-lg font-bold">No items found</p>
                <p className="text-sm">Try another search or category</p>
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
