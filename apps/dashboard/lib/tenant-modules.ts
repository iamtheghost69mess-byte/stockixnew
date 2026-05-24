/** Licensed product modules (matches worker + API). */
export type StockixModuleId = "accounting" | "pos" | "pms" | "chat";

export const STOCKIX_MODULE_IDS: StockixModuleId[] = [
  "accounting",
  "pos",
  "pms",
  "chat",
];

export type ProvisionProfileId =
  | "pos_only"
  | "accounting_only"
  | "pos_accounting_connected"
  | "custom";

export type ProvisionProfile = {
  id: ProvisionProfileId;
  title: string;
  subtitle: string;
  modules: StockixModuleId[];
  deploySummary: string;
  integrationNote?: string;
};

/** Standard deployment modes (Modes 1–3 from product architecture). */
export const PROVISION_PROFILES: ProvisionProfile[] = [
  {
    id: "pos_only",
    title: "POS only",
    subtitle: "Restaurant operations — tables, kitchen, ingredient inventory",
    modules: ["pos"],
    deploySummary:
      "Deploys the POS stack only (MongoDB, POS API, POS UI). Native POS accounting stays on. No Finance / Bigcapital stack.",
  },
  {
    id: "accounting_only",
    title: "Accounting only",
    subtitle: "Full double-entry GL — invoices, COA, financial reports",
    modules: ["accounting"],
    deploySummary:
      "Deploys Stockix Finance only (MySQL, Finance API, web app). No POS stack.",
  },
  {
    id: "pos_accounting_connected",
    title: "POS + Accounting (connected)",
    subtitle: "Operations on POS — books on Finance with async sale sync",
    modules: ["accounting", "pos"],
    deploySummary:
      "Deploys Finance and POS. Seeds Finance warehouse, walk-in customer, and deposit accounts for integration. Configure item & location mapping in POS after go-live.",
    integrationNote:
      "Enable Bigcapital integration in POS settings and map menu items to Finance items before relying on synced COGS.",
  },
  {
    id: "custom",
    title: "Custom",
    subtitle: "Pick modules manually (PMS, Chat, or mixed bundles)",
    modules: [],
    deploySummary:
      "Deploys only the stacks for the modules you select below. Use when the customer needs PMS or Chatwoot in addition to core products.",
  },
];

export const MODULE_CATALOG: {
  id: StockixModuleId;
  label: string;
  description: string;
}[] = [
  {
    id: "accounting",
    label: "Accounting (Finance)",
    description: "Double-entry GL, invoicing, bank rec, financial statements",
  },
  {
    id: "pos",
    label: "Point of Sale",
    description: "Restaurant POS, recipes, ingredient stock, kitchen flow",
  },
  {
    id: "pms",
    label: "Property Management",
    description: "Rooms, bookings, guests (hotel / villa)",
  },
  {
    id: "chat",
    label: "Messaging (Chatwoot)",
    description: "WhatsApp, Instagram, unified inbox",
  },
];

const MODULE_ORDER: Record<StockixModuleId, number> = {
  accounting: 0,
  pos: 1,
  pms: 2,
  chat: 3,
};

export function sortModules(mods: StockixModuleId[]): StockixModuleId[] {
  return [...mods].sort((a, b) => MODULE_ORDER[a] - MODULE_ORDER[b]);
}

export function parseLicenseModules(raw: unknown): StockixModuleId[] {
  if (Array.isArray(raw)) {
    return sortModules(
      raw.filter((m): m is StockixModuleId =>
        typeof m === "string" && STOCKIX_MODULE_IDS.includes(m as StockixModuleId),
      ),
    );
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      return parseLicenseModules(JSON.parse(raw) as unknown);
    } catch {
      return ["accounting"];
    }
  }
  return ["accounting"];
}

export function modulesEqual(a: StockixModuleId[], b: StockixModuleId[]): boolean {
  const sa = sortModules(a).join(",");
  const sb = sortModules(b).join(",");
  return sa === sb;
}

export function moduleLabel(mod: string): string {
  switch (mod) {
    case "accounting":
      return "Accounting";
    case "pos":
      return "POS";
    case "pms":
      return "PMS";
    case "chat":
      return "Chat";
    default:
      return mod;
  }
}

export function formatModulesList(mods: StockixModuleId[]): string {
  if (mods.length === 0) return "—";
  return sortModules(mods).map(moduleLabel).join(", ");
}

export function findProfileForModules(mods: StockixModuleId[]): ProvisionProfileId {
  const sorted = sortModules(mods);
  for (const profile of PROVISION_PROFILES) {
    if (profile.id === "custom") continue;
    if (modulesEqual(sorted, profile.modules)) return profile.id;
  }
  return "custom";
}

export function profileModules(profileId: ProvisionProfileId): StockixModuleId[] {
  if (profileId === "custom") return ["accounting"];
  const p = PROVISION_PROFILES.find((x) => x.id === profileId);
  return p?.modules.length ? [...p.modules] : ["accounting"];
}

export function deploySummaryForModules(mods: StockixModuleId[]): string {
  const profileId = findProfileForModules(mods);
  if (profileId !== "custom") {
    return PROVISION_PROFILES.find((p) => p.id === profileId)?.deploySummary ?? "";
  }
  const parts: string[] = [];
  if (mods.includes("accounting")) parts.push("Finance stack");
  if (mods.includes("pos")) parts.push("POS stack");
  if (mods.includes("pms")) parts.push("PMS stack");
  if (mods.includes("chat")) parts.push("Chatwoot");
  if (parts.length === 0) return "Select at least one module.";
  return `Deploys: ${parts.join(" + ")}.`;
}
