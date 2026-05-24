/** Mirrors `pos-frontend` `userSlice` / `Login.jsx` — backend login returns `data: user.toJSON()`, then `/api/user` enriches permissions. */

export type PosOrgRef = {
  _id?: string;
  name?: string;
  slug?: string;
};

export type PosAuthUser = {
  /** Set after login or `/api/user`; may be missing on older persisted sessions. */
  _id?: string;
  name: string;
  /** Optional; PIN-only staff may have no email. */
  email?: string;
  phone?: string;
  /** Lowercased role string from API */
  role: string;
  location?: unknown;
  locations?: unknown[];
  organization?: PosOrgRef | null;
  permissionRole?: string | null;
  rbacRoleKey: string;
  permissions: string[];
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

function userIdStringFromLoginPayload(idRaw: unknown): string {
  if (typeof idRaw === "string" && idRaw.trim()) return idRaw.trim();
  if (typeof idRaw === "number" && Number.isFinite(idRaw)) return String(Math.trunc(idRaw));
  return "";
}

/** Build session user from POST `/api/auth/login` JSON `data` (User document). */
export function posUserFromLoginData(data: unknown): PosAuthUser | null {
  const o = asRecord(data);
  if (!o) return null;
  const _id = userIdStringFromLoginPayload(o._id);
  if (!_id) return null;
  const roleRaw = String(o.role ?? "").trim();
  const role = roleRaw.toLowerCase();
  return {
    _id,
    name: typeof o.name === "string" ? o.name : "",
    email: typeof o.email === "string" && o.email.trim() ? o.email.trim().toLowerCase() : undefined,
    phone: typeof o.phone === "string" ? o.phone : undefined,
    role,
    location: o.location ?? null,
    locations: Array.isArray(o.locations) ? (o.locations as unknown[]) : [],
    permissionRole: (o.permissionRole as string | null | undefined) ?? null,
    rbacRoleKey: String(o.rbacRoleKey ?? role ?? "").toLowerCase(),
    permissions: [],
  };
}

function normalizeOrgRef(raw: unknown): PosOrgRef | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    _id: typeof o._id === "string" ? o._id : undefined,
    name: typeof o.name === "string" ? o.name : undefined,
    slug: typeof o.slug === "string" ? o.slug : undefined,
  };
}

/** Build session user from GET `/api/user` payload (`posApiJson` `data`). */
export function posUserFromProfile(u: {
  _id?: string;
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  location?: unknown;
  locations?: unknown[];
  organization?: unknown;
  permissionRole?: string | null;
  rbacRoleKey?: string;
  permissions?: string[];
}): PosAuthUser {
  const role = String(u.role ?? "").toLowerCase();
  return {
    _id: typeof u._id === "string" ? u._id : undefined,
    name: u.name ?? "",
    email: typeof u.email === "string" && u.email.trim() ? u.email.trim().toLowerCase() : undefined,
    phone: u.phone,
    role,
    location: u.location ?? null,
    locations: Array.isArray(u.locations) ? u.locations : [],
    organization: normalizeOrgRef(u.organization),
    permissionRole: u.permissionRole ?? null,
    rbacRoleKey: String(u.rbacRoleKey ?? u.role ?? "").toLowerCase(),
    permissions: Array.isArray(u.permissions) ? u.permissions : [],
  };
}

/** Shape expected by `NavUser` in `@restaurant-pos/ui/shell` (no avatar URL from API yet). */
export type PosShellNavUserDisplay = {
  readonly name: string;
  readonly email: string;
  readonly avatar: string;
};

/**
 * Map POS session user into sidebar/header display model.
 */
export function posAuthUserToShellNavDisplay(user: PosAuthUser | null): PosShellNavUserDisplay {
  if (!user) {
    return { name: "Guest", email: "", avatar: "" };
  }
  const name = user.name.trim() || "Staff";
  const emailRaw = user.email?.trim();
  const phoneRaw = user.phone?.trim();
  const orgSlug = user.organization?.slug?.trim();
  const email =
    emailRaw || (phoneRaw ? `Phone: ${phoneRaw}` : "") || (orgSlug ? `${user.role} · ${orgSlug}` : user.role) || "—";
  return { name, email, avatar: "" };
}

export function locationLabel(location: unknown): string | null {
  if (!location || typeof location !== "object") return null;
  const o = location as { name?: unknown; code?: unknown };
  if (typeof o.name === "string" && o.name.trim()) return o.name.trim();
  if (typeof o.code === "string" && o.code.trim()) return o.code.trim();
  return null;
}
