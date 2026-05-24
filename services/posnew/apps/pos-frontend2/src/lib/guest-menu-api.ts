import { getPosApiOrigin } from "@/config/pos-api";
import { sanitizePosApiErrorMessage } from "@/lib/format-pos-api-error";
import { posApiFetch, posApiJson } from "@/lib/pos-api-fetch";

const PUBLIC_VISITOR_KEY = "pos-public-visitor-key";

function getOrCreatePublicVisitorKey(): string {
  if (typeof window === "undefined") return "";
  try {
    let key = window.localStorage.getItem(PUBLIC_VISITOR_KEY);
    if (!key) {
      key =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
      window.localStorage.setItem(PUBLIC_VISITOR_KEY, key);
    }
    return key;
  } catch {
    return "";
  }
}

export type PublicMenuBranding = {
  displayName?: string;
  tagline?: string;
  logoUrl?: string;
  accentColor?: string;
  showPrices?: boolean;
  scopeKey?: string;
  location?: string | null;
};

export type PublicCategory = {
  _id: string;
  name?: string;
  menuNote?: string;
  color?: string;
  sortOrder?: number;
  parentCategory?: { _id?: string; name?: string; color?: string } | string | null;
};

export type PublicMenuItem = {
  _id: string;
  name?: string;
  description?: string;
  menuNote?: string;
  price?: number;
  currency?: string;
  priceUsd?: number | null;
  priceLbp?: number | null;
  imageUrl?: string;
  isAvailable?: boolean;
  stockCanFulfill?: boolean;
  estimatedPortions?: number | null;
  stockReason?: string;
  category?: { _id?: string; name?: string; color?: string } | string | null;
};

export type FetchPublicMenuParams =
  | { readonly tableId: string; readonly orgSlug?: never; readonly locationId?: never }
  | { readonly orgSlug: string; readonly tableId?: never; readonly locationId?: string | null };

export type PublicMenuPayload = {
  branding: PublicMenuBranding;
  categories: PublicCategory[];
  items: PublicMenuItem[];
};

export async function fetchPublicMenuBranding(locationId?: string | null) {
  const q = new URLSearchParams();
  if (locationId) q.set("location", locationId);
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return posApiJson<PublicMenuBranding>(`/api/config/public-menu-branding${suffix}`);
}

export async function updatePublicMenuBranding(data: {
  location?: string | null;
  displayName?: string;
  tagline?: string;
  logoUrl?: string;
  accentColor?: string;
  showPrices?: boolean;
}) {
  return posApiJson<PublicMenuBranding>("/api/config/public-menu-branding", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

function publicMenuQueryString(params: FetchPublicMenuParams): string {
  const q = new URLSearchParams();
  if ("tableId" in params && params.tableId) {
    q.set("table", params.tableId);
    return q.toString();
  }
  if ("orgSlug" in params && params.orgSlug) {
    q.set("org", params.orgSlug);
    if (params.locationId) q.set("location", params.locationId);
    return q.toString();
  }
  throw new Error("Provide tableId or orgSlug.");
}

/**
 * Anonymous public menu: exactly one of `tableId` (table QR) or `orgSlug` (venue browse link).
 * Optional `locationId` applies only with `orgSlug` (location-scoped branding before default).
 */
export async function fetchPublicMenu(params: FetchPublicMenuParams): Promise<PublicMenuPayload> {
  const url = `${getPosApiOrigin()}/api/public/menu?${publicMenuQueryString(params)}`;
  const headers = new Headers({ Accept: "application/json" });
  const visitorKey = getOrCreatePublicVisitorKey();
  if (visitorKey) {
    headers.set("X-Visitor-Key", visitorKey);
    headers.set("X-Session-Id", visitorKey);
  }
  const res = await fetch(url, {
    method: "GET",
    headers,
    cache: "no-store",
  });
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = {};
  }
  const obj = body as {
    success?: boolean;
    message?: string;
    data?: { branding?: PublicMenuBranding; categories?: PublicCategory[]; items?: PublicMenuItem[] };
  };
  if (!res.ok) {
    throw new Error(sanitizePosApiErrorMessage(obj?.message || `Could not load guest menu (${res.status}).`));
  }
  return {
    branding: obj.data?.branding ?? {},
    categories: Array.isArray(obj.data?.categories) ? obj.data.categories : [],
    items: Array.isArray(obj.data?.items) ? obj.data.items : [],
  };
}

/** @deprecated Prefer fetchPublicMenu({ tableId }) */
export async function fetchPublicMenuByTable(tableId: string): Promise<PublicMenuPayload> {
  return fetchPublicMenu({ tableId });
}

/** Authenticated: PNG QR encoding `/self-order?org=<tenant slug>` (browse-only venue menu). */
export async function fetchVenueSelfOrderQrBlob(): Promise<Blob> {
  const res = await posApiFetch("/api/config/self-order-venue-qr");
  if (!res.ok) {
    let msg = `Could not load venue QR (${res.status}).`;
    try {
      const body = (await res.json()) as { message?: string };
      if (typeof body?.message === "string" && body.message) msg = body.message;
    } catch {
      // keep generic message
    }
    throw new Error(sanitizePosApiErrorMessage(msg));
  }
  return res.blob();
}
