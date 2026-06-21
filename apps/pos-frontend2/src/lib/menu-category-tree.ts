import type { PosCategory } from "@/lib/pos-catalog-api";

function parentIdOf(row: PosCategory): string | null {
  const p = row.parentCategory;
  if (p == null) return null;
  if (typeof p === "string") return p;
  if (p._id != null) return String(p._id);
  return null;
}

/** Strict descendants of `rootId` (BFS on parentCategory edges), excluding `rootId`. */
export function collectDescendantMenuCategoryIds(rootId: string, rows: PosCategory[]): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const r of rows) {
    const pid = parentIdOf(r);
    if (!pid) continue;
    const id = String(r._id);
    const list = childrenByParent.get(pid) ?? [];
    list.push(id);
    childrenByParent.set(pid, list);
  }
  const out = new Set<string>();
  let frontier = [String(rootId)];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      const kids = childrenByParent.get(id) ?? [];
      for (const k of kids) {
        if (!out.has(k)) {
          out.add(k);
          next.push(k);
        }
      }
    }
    frontier = next;
  }
  return out;
}
