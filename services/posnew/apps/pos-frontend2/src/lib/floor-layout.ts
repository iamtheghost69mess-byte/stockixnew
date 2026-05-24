import type { FloorTable } from "@/lib/floor-table-types";

const MARGIN = 0.04;

/** Clamp normalized anchor (0–1) used as fraction of plan width/height for table center. */
export function clampFloorAnchor(v: number): number {
  if (!Number.isFinite(v)) return 0.5;
  return Math.min(1 - MARGIN, Math.max(MARGIN, v));
}

/**
 * Deterministic grid for tables without persisted anchors (until staff drags them).
 * Centers are spaced in [margin, 1-margin].
 */
export function autoFloorAnchor(index: number, total: number): { x: number; y: number } {
  const n = Math.max(1, Math.floor(total) || 1);
  const i = Math.max(0, Math.floor(index));
  const cols = Math.min(4, Math.ceil(Math.sqrt(n * 1.2)));
  const rows = Math.ceil(n / cols);
  const col = i % cols;
  const row = Math.floor(i / cols);
  const innerW = 1 - 2 * MARGIN;
  const innerH = 1 - 2 * MARGIN;
  const cellW = cols > 0 ? innerW / cols : innerW;
  const cellH = rows > 0 ? innerH / rows : innerH;
  const x = MARGIN + col * cellW + cellW / 2;
  const y = MARGIN + row * cellH + cellH / 2;
  return { x: clampFloorAnchor(x), y: clampFloorAnchor(y) };
}

/** Stable order for auto-layout (unchanging ids → stable positions). */
export function sortedFloorTablesForLayout(tables: FloorTable[]): FloorTable[] {
  return [...tables].sort((a, b) => a.id.localeCompare(b.id));
}

export function layoutPositionForTable(table: FloorTable, index: number, total: number): { x: number; y: number } {
  const ax = table.floorAnchorX;
  const ay = table.floorAnchorY;
  if (ax != null && ay != null && Number.isFinite(ax) && Number.isFinite(ay)) {
    return { x: clampFloorAnchor(ax), y: clampFloorAnchor(ay) };
  }
  return autoFloorAnchor(index, total);
}
