import type { StockTakeLine } from "@/lib/pos-stock-take-api";

export type StockTakeLineIngredient = {
  _id: string;
  name: string;
  unit?: string;
  sku?: string;
  isSerialTracked?: boolean;
};

export function effectiveCountedQty(
  line: StockTakeLine,
  localCounts: Record<string, number>,
): number | null {
  const local = localCounts[line._id];
  if (local !== undefined && !Number.isNaN(local)) return local;
  if (line.countedQty !== null && line.countedQty !== undefined) {
    return Number(line.countedQty);
  }
  return null;
}

export function lineIngredient(
  line: StockTakeLine,
): StockTakeLineIngredient | null {
  if (typeof line.ingredient === "object" && line.ingredient !== null && "_id" in line.ingredient) {
    return line.ingredient as StockTakeLineIngredient;
  }
  return null;
}

export function serialLinesWithVariance(
  lines: StockTakeLine[],
  localCounts: Record<string, number>,
): Array<{ lineId: string; ingredientName: string; ingredientId: string }> {
  const out: Array<{ lineId: string; ingredientName: string; ingredientId: string }> = [];
  for (const line of lines) {
    const ing = lineIngredient(line);
    if (!ing?.isSerialTracked) continue;
    const counted = effectiveCountedQty(line, localCounts);
    if (counted === null) continue;
    const system = Number(line.systemQty) || 0;
    if (Math.abs(counted - system) < 1e-9) continue;
    out.push({
      lineId: line._id,
      ingredientId: ing._id,
      ingredientName: ing.name,
    });
  }
  return out;
}

export function isStockTakeSerialVarianceError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = "code" in err ? String((err as { code?: string }).code) : "";
  if (code === "STOCK_TAKE_SERIAL_VARIANCE") return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /serial-tracked ingredient/i.test(msg);
}
