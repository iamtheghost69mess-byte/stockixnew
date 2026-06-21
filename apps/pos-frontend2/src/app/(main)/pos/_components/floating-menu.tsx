"use client";

import type React from "react";
import { useEffect, useRef } from "react";

import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

/**
 * FloatingMenu Component for POS
 *
 * Renders a floating dropdown menu for the sidebar in collapsed mode.
 * Uses createPortal to ensure it's not clipped by containers.
 */
interface FloatingMenuProps {
  category: any;
  rect: DOMRect | null;
  onClose: () => void;
  onSelect: (id: string) => void;
  selectedId: string;
}

export const FloatingMenu = ({ category, rect, onClose, onSelect, selectedId }: FloatingMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  if (!rect) return null;

  const topPos = Math.max(10, Math.min(window.innerHeight - 300, rect.top));

  const style: React.CSSProperties = {
    top: topPos,
    left: rect.right + 10,
    position: "fixed",
    zIndex: 9999,
  };

  return createPortal(
    <div
      ref={menuRef}
      style={style}
      className="fade-in zoom-in-95 w-64 animate-in rounded-2xl border border-zinc-800 bg-zinc-950 p-2 shadow-2xl duration-200"
    >
      <div className="mb-1 border-zinc-900 border-b px-4 py-3">
        <span className="font-black text-[10px] text-zinc-500 uppercase tracking-widest">{category.name}</span>
      </div>
      <ul className="space-y-1">
        {category.children?.map((item: any) => {
          const active = selectedId === item._id;
          return (
            <li key={item._id}>
              <button
                onClick={() => {
                  onSelect(item._id);
                  onClose();
                }}
                className={cn(
                  "w-full rounded-xl px-4 py-4 text-start font-bold text-sm transition-all duration-200",
                  active
                    ? "bg-emerald-600 text-white shadow-md"
                    : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100",
                )}
              >
                {item.name}
              </button>
            </li>
          );
        })}
      </ul>
    </div>,
    document.body,
  );
};
