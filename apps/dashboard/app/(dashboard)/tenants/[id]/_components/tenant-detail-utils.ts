import type { StockixModuleId } from "@/lib/tenant-modules";

export const MAX_PROVISION_POLL_MS = 45 * 60 * 1000;
export const PROVISION_POLL_INTERVAL_MS = 2500;

export async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

export function moduleBadgeVariant(
  mod: string,
): "default" | "secondary" | "outline" {
  if (mod === "accounting") return "default";
  if (mod === "pos") return "secondary";
  return "outline";
}

export type AddableModule = "pos" | "pms" | "chat";

export function isAddableModule(mod: string): mod is AddableModule {
  return mod === "pos" || mod === "pms" || mod === "chat";
}

export function asStockixModuleId(mod: string): StockixModuleId {
  return mod as StockixModuleId;
}
