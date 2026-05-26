import type { PlanValues } from "@/lib/schemas";

export type PlanRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  maxOrganizations: number;
  maxActivations: number;
  maxUsers: number;
  isActive: boolean;
  sortOrder: number;
  activeLicenseCount: number;
  priceMonthly: number | null;
  priceAnnually: number | null;
  currency: string | null;
  billingInterval: string | null;
  isPublic: boolean;
  features: string[];
  priceMonthlyDisplay: string | null;
  priceAnnuallyDisplay: string | null;
  createdAt: string;
  updatedAt: string;
};

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function slugifyName(name: string): string {
  const s = name
    .toLowerCase()
    .trim()
    .replace(/[''`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return s.length >= 2 ? s : "";
}

export function parsePlansPayload(body: unknown): PlanRow[] {
  if (!isRecord(body) || !Array.isArray(body.plans)) return [];
  const out: PlanRow[] = [];
  for (const row of body.plans) {
    if (!isRecord(row)) continue;
    if (
      typeof row.id !== "string"
      || typeof row.name !== "string"
      || typeof row.slug !== "string"
      || typeof row.isActive !== "boolean"
      || typeof row.sortOrder !== "number"
      || typeof row.maxOrganizations !== "number"
      || typeof row.maxActivations !== "number"
      || typeof row.maxUsers !== "number"
    ) {
      continue;
    }
    const features = Array.isArray(row.features)
      ? row.features.filter((f): f is string => typeof f === "string")
      : [];
    out.push({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: typeof row.description === "string" ? row.description : null,
      maxOrganizations: row.maxOrganizations,
      maxActivations: row.maxActivations,
      maxUsers: row.maxUsers,
      isActive: row.isActive,
      sortOrder: row.sortOrder,
      activeLicenseCount: typeof row.activeLicenseCount === "number" ? row.activeLicenseCount : 0,
      priceMonthly: typeof row.priceMonthly === "number" ? row.priceMonthly : null,
      priceAnnually: typeof row.priceAnnually === "number" ? row.priceAnnually : null,
      currency: typeof row.currency === "string" ? row.currency : null,
      billingInterval: typeof row.billingInterval === "string" ? row.billingInterval : null,
      isPublic: row.isPublic === true,
      features,
      priceMonthlyDisplay:
        typeof row.priceMonthlyDisplay === "string" ? row.priceMonthlyDisplay : null,
      priceAnnuallyDisplay:
        typeof row.priceAnnuallyDisplay === "string" ? row.priceAnnuallyDisplay : null,
      createdAt: typeof row.createdAt === "string" ? row.createdAt : "",
      updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : "",
    });
  }
  return out;
}

export const defaultCreateValues: PlanValues = {
  name: "",
  slug: "",
  description: undefined,
  maxOrganizations: 1,
  maxActivations: 1,
  maxUsers: 999,
  isActive: true,
  sortOrder: 0,
  currency: "USD",
  isPublic: false,
  featuresText: "",
};

export function planPriceLabel(row: PlanRow): string {
  if (row.priceMonthly == null && row.priceAnnually == null) return "Custom";
  const label = row.priceMonthlyDisplay ?? row.priceAnnuallyDisplay ?? "";
  return row.billingInterval ? `${label} / ${row.billingInterval}` : label;
}

export function planBillingApiBody(
  values: Pick<
    PlanValues,
    | "priceMonthly"
    | "priceAnnually"
    | "currency"
    | "billingInterval"
    | "isPublic"
    | "featuresText"
  >,
) {
  const features = values.featuresText
    ?.split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    priceMonthly: values.priceMonthly ?? null,
    priceAnnually: values.priceAnnually ?? null,
    currency: values.currency ?? "USD",
    billingInterval: values.billingInterval ?? null,
    isPublic: values.isPublic ?? false,
    features: features?.length ? features : null,
  };
}
