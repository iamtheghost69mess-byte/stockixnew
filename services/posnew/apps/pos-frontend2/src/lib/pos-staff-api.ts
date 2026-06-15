import { type PosStaffListLimits, posApiJson } from "@/lib/pos-api-fetch";

export const STAFF_QUERY_KEYS = {
  all: ["staff"] as const,
  list: () => ["staff", "list"] as const,
  detail: (id: string) => ["staff", "detail", id] as const,
};

export type PosStaff = {
  _id: string;
  name: string;
  username?: string;
  phone?: string;
  email?: string;
  pin?: string;
  role?: "admin" | "manager" | "waiter" | "kitchen" | "cashier" | "hostess";
  permissionRole?: string | null;
  /** Derived from API `status` */
  isActive?: boolean;
  status?: "active" | "suspended";
  /** True when a POS sign-in PIN exists (plaintext is hashed server-side and never returned by the API). */
  hasLoginPin?: boolean;
  pinFailedAttempts?: number;
  pinLockedUntil?: string | null;
  location?: { _id?: string; name?: string; code?: string } | string | null;
  locations?: Array<{ _id?: string; name?: string; code?: string } | string>;
};

export type PosLocationRef = {
  _id: string;
  name?: string;
  code?: string;
};

function normalizeStaffRow(raw: Record<string, unknown>): PosStaff {
  const id = String(raw._id ?? raw.id ?? "");
  const st = raw.status === "suspended" ? "suspended" : "active";
  return {
    _id: id,
    name: String(raw.name ?? ""),
    username: raw.username != null && String(raw.username).trim() !== "" ? String(raw.username).trim() : undefined,
    phone: raw.phone != null && String(raw.phone).trim() !== "" ? String(raw.phone).trim() : undefined,
    email: raw.email != null && String(raw.email).trim() !== "" ? String(raw.email).trim() : undefined,
    role: raw.role as PosStaff["role"],
    permissionRole: raw.permissionRole != null ? String(raw.permissionRole) : undefined,
    status: st,
    isActive: st === "active",
    hasLoginPin: Boolean(raw.hasLoginPin),
    pinFailedAttempts: Number(raw.pinFailedAttempts || 0),
    pinLockedUntil:
      raw.pinLockedUntil != null && String(raw.pinLockedUntil).trim() !== ""
        ? String(raw.pinLockedUntil)
        : null,
    location: (raw.location as PosStaff["location"]) ?? null,
    locations: Array.isArray(raw.locations) ? (raw.locations as PosStaff["locations"]) : [],
  };
}

const FALLBACK_LIMITS = (staffCount: number): PosStaffListLimits => ({
  maxUsers: 25,
  staffCount,
  licenseStartsAt: null,
  licenseEndsAt: null,
});

export async function posListStaff(): Promise<{ staff: PosStaff[]; limits: PosStaffListLimits }> {
  const res = await posApiJson<Record<string, unknown>[]>("/api/users");
  const rows = Array.isArray(res.data) ? res.data : [];
  const staff = rows.map((r) => normalizeStaffRow(r as Record<string, unknown>));
  const lim = res.limits;
  if (lim && typeof lim.maxUsers === "number" && typeof lim.staffCount === "number") {
    return {
      staff,
      limits: {
        maxUsers: lim.maxUsers,
        staffCount: lim.staffCount,
        licenseStartsAt: lim.licenseStartsAt ?? null,
        licenseEndsAt: lim.licenseEndsAt ?? null,
      },
    };
  }
  return { staff, limits: FALLBACK_LIMITS(staff.length) };
}

export async function posCreateStaff(data: Partial<PosStaff> & { status?: string }): Promise<PosStaff> {
  const res = await posApiJson<Record<string, unknown>>("/api/users", {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (!res.data) throw new Error(res.message || "Failed to create staff");
  return normalizeStaffRow(res.data as Record<string, unknown>);
}

export async function posUpdateStaff(id: string, data: Partial<PosStaff> & { status?: string }): Promise<PosStaff> {
  const res = await posApiJson<Record<string, unknown>>(`/api/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  if (!res.data) throw new Error(res.message || "Failed to update staff");
  return normalizeStaffRow(res.data as Record<string, unknown>);
}

export async function posDeleteStaff(id: string): Promise<void> {
  await posApiJson<void>(`/api/users/${id}`, {
    method: "DELETE",
  });
}

export async function posUnlockStaffPin(id: string): Promise<PosStaff> {
  const res = await posApiJson<Record<string, unknown>>(`/api/users/${id}/unlock-pin`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (!res.data) throw new Error(res.message || "Failed to unlock staff PIN.");
  return normalizeStaffRow(res.data as Record<string, unknown>);
}

export async function posListLocationsForStaff(): Promise<PosLocationRef[]> {
  const res = await posApiJson<Record<string, unknown>[]>("/api/locations");
  const rows = Array.isArray(res.data) ? res.data : [];
  return rows
    .map((row) => ({
      _id: String(row._id || ""),
      name: typeof row.name === "string" ? row.name : undefined,
      code: typeof row.code === "string" ? row.code : undefined,
    }))
    .filter((row) => row._id.length > 0);
}
