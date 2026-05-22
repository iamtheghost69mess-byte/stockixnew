"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ChevronDown, ChevronRight, Folder, FolderOpen, LayoutGrid, Tag } from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import type { PosCategory } from "@/lib/pos-catalog-api";
import { cn } from "@/lib/utils";

import { FloatingMenu } from "./floating-menu";

interface PosCategorySidebarProps {
  categories: PosCategory[];
  selectedCategoryId: string;
  onSelectCategory: (id: string) => void;
  collapsed?: boolean;
}

interface CategoryNode extends PosCategory {
  children: CategoryNode[];
  level: number;
}

export function PosCategorySidebar({
  categories,
  selectedCategoryId,
  onSelectCategory,
  collapsed = false,
}: PosCategorySidebarProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [activeFloatingMenu, setActiveFloatingMenu] = useState<{ category: any; rect: DOMRect } | null>(null);

  const categoryTree = useMemo(() => {
    const map = new Map<string, CategoryNode>();
    const roots: CategoryNode[] = [];

    categories.forEach((cat) => {
      map.set(String(cat._id), { ...cat, children: [], level: 0 });
    });

    categories.forEach((cat) => {
      const node = map.get(String(cat._id))!;
      const parentId = typeof cat.parentCategory === "string" ? cat.parentCategory : cat.parentCategory?._id;

      if (parentId && map.has(String(parentId))) {
        map.get(String(parentId))!.children.push(node);
      } else {
        roots.push(node);
      }
    });

    const assignLevels = (nodes: CategoryNode[], level: number) => {
      nodes.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      nodes.forEach((n) => {
        n.level = level;
        assignLevels(n.children, level + 1);
      });
    };
    assignLevels(roots, 0);

    return roots;
  }, [categories]);

  useEffect(() => {
    if (selectedCategoryId === "all" || collapsed) return;
    const path = new Set<string>();
    let currId: string | null = selectedCategoryId;
    while (currId) {
      const cat = categories.find((c) => String(c._id) === currId);
      if (!cat) break;
      const pid = typeof cat.parentCategory === "string" ? cat.parentCategory : cat.parentCategory?._id;
      if (pid) path.add(String(pid));
      currId = pid ? String(pid) : null;
    }
    setExpanded((prev) => new Set([...prev, ...path]));
  }, [selectedCategoryId, categories, collapsed]);

  const toggleExpand = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (collapsed) return;
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [collapsed],
  );

  const handleCollapsedHover = (category: any, rect: DOMRect) => {
    if (!collapsed) return;
    setActiveFloatingMenu({ category, rect });
  };

  return (
    <div
      className={cn(
        "flex h-full flex-col bg-zinc-950 border-r border-zinc-800 transition-all duration-300",
        collapsed ? "w-20" : "w-72",
      )}
    >
      {/* Sidebar Header Style */}
      <div className={cn("shrink-0 py-8 px-4", collapsed ? "items-center" : "ps-6")}>
        {!collapsed && (
          <div className="flex items-center gap-3 mb-6">
            <div className="h-8 w-8 rounded-xl bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-900/40">
              <LayoutGrid className="h-4 w-4 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-black text-white uppercase tracking-widest leading-none">POS CATALOG</span>
              <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-tighter mt-1">
                Enterprise Edition
              </span>
            </div>
          </div>
        )}

        <button
          onClick={() => onSelectCategory("all")}
          className={cn(
            "group flex items-center transition-all duration-300 rounded-xl",
            collapsed ? "h-12 w-12 justify-center mx-auto" : "w-full h-12 px-4 gap-3",
            selectedCategoryId === "all"
              ? "bg-emerald-600 text-white shadow-xl shadow-emerald-900/20"
              : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200",
          )}
        >
          <LayoutGrid className={cn("h-5 w-5", selectedCategoryId === "all" ? "opacity-100" : "opacity-40")} />
          {!collapsed && <span className="text-sm font-bold tracking-wide">All Items</span>}
        </button>
      </div>

      <div className="mx-4 mb-4 h-px bg-zinc-800" />

      {/* Recursive Category Tree */}
      <ScrollArea className="flex-1 px-3">
        <ul className="space-y-1 pb-10">
          {categoryTree.map((root) => (
            <CategoryItem
              key={root._id}
              node={root}
              selectedId={selectedCategoryId}
              expanded={expanded}
              onSelect={onSelectCategory}
              onToggle={toggleExpand}
              collapsed={collapsed}
              onHover={handleCollapsedHover}
            />
          ))}
        </ul>
      </ScrollArea>

      {activeFloatingMenu && (
        <FloatingMenu
          category={activeFloatingMenu.category}
          rect={activeFloatingMenu.rect}
          onClose={() => setActiveFloatingMenu(null)}
          onSelect={onSelectCategory}
          selectedId={selectedCategoryId}
        />
      )}
    </div>
  );
}

function CategoryItem({
  node,
  selectedId,
  expanded,
  onSelect,
  onToggle,
  collapsed,
  onHover,
}: {
  node: CategoryNode;
  selectedId: string;
  expanded: Set<string>;
  onSelect: (id: string) => void;
  onToggle: (id: string, e: React.MouseEvent) => void;
  collapsed: boolean;
  onHover: (category: any, rect: DOMRect) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded.has(node._id);
  const isSelected = selectedId === node._id;

  const handleClick = (e: React.MouseEvent) => {
    if (collapsed && hasChildren) {
      onHover(node, e.currentTarget.getBoundingClientRect());
    } else {
      onSelect(node._id);
      if (hasChildren) onToggle(node._id, e);
    }
  };

  return (
    <li className={cn("select-none mb-1 group relative", collapsed ? "px-0" : "px-2")}>
      <button
        onClick={handleClick}
        className={cn(
          "relative flex items-center transition-all duration-500 rounded-[1.25rem] font-black text-[11px] uppercase tracking-wider",
          collapsed ? "h-14 w-14 justify-center mx-auto" : "h-14 w-full px-4 gap-3 justify-start",
          isSelected
            ? "bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-xl shadow-emerald-950/40 ring-1 ring-emerald-400/40"
            : "text-zinc-600 hover:bg-zinc-900/50 hover:text-zinc-300",
        )}
        style={{ paddingLeft: !collapsed ? `${node.level * 16 + 16}px` : undefined }}
      >
        {/* Active Indicator Bar */}
        {isSelected && !collapsed && (
          <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-white rounded-full shadow-[0_0_12px_rgba(255,255,255,0.8)]" />
        )}

        {/* Category Icon */}
        <div
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center transition-all duration-300",
            isSelected ? "text-white scale-110" : "text-zinc-700 group-hover:text-zinc-400",
          )}
        >
          {hasChildren ? (
            isExpanded ? (
              <FolderOpen className="h-5 w-5" />
            ) : (
              <Folder className="h-5 w-5" />
            )
          ) : (
            <Tag className="h-4 w-4" style={{ color: isSelected ? "white" : node.color }} />
          )}
        </div>

        {!collapsed && <span className="truncate flex-1 text-start leading-none pt-0.5">{node.name}</span>}

        {/* Arrow on the RIGHT */}
        {hasChildren && !collapsed && (
          <span className={cn("transition-transform duration-500", isExpanded ? "rotate-180" : "")}>
            <ChevronDown className="h-4 w-4 opacity-30 group-hover:opacity-60" />
          </span>
        )}
      </button>

      {/* Render Children Tree View */}
      {hasChildren && isExpanded && !collapsed && (
        <ul className="mt-1 relative ml-5 pl-4 border-l border-zinc-800/50 space-y-1">
          {node.children.map((child) => (
            <CategoryItem
              key={child._id}
              node={child}
              selectedId={selectedId}
              expanded={expanded}
              onSelect={onSelect}
              onToggle={onToggle}
              collapsed={collapsed}
              onHover={onHover}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
