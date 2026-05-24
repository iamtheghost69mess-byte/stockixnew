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
      className="bg-zinc-950 border border-zinc-800 shadow-2xl rounded-2xl p-2 w-64 animate-in fade-in zoom-in-95 duration-200"
    >
      <div className="px-4 py-3 mb-1 border-b border-zinc-900">
        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{category.name}</span>
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
                  "w-full text-start px-4 py-4 rounded-xl text-sm transition-all duration-200 font-bold",
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
