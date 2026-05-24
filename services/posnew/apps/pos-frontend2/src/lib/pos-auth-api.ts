import { sanitizePosApiErrorMessage } from "@/lib/format-pos-api-error";
import { clearPosDevTokens, posApiJson, posPublicFetch } from "@/lib/pos-api-fetch";

export type PosLoginSuccessBody = {
  success?: boolean;
  message?: string;
  data?: Record<string, unknown>;
  accessToken?: string;
  refreshToken?: string;
};

export type PosLoginErrorCode =
  | "DEVICE_PENDING"
  | "DEVICE_REVOKED"
  | "INVALID_PIN"
  | "ACCOUNT_LOCKED";

export class PosLoginError extends Error {
  public readonly code: PosLoginErrorCode | null;

  public readonly remainingAttempts: number | null;

  public readonly remainingSeconds: number | null;

  public constructor(params: {
    message: string;
    code: PosLoginErrorCode | null;
    remainingAttempts: number | null;
    remainingSeconds: number | null;
  }) {
    super(params.message);
    this.name = "PosLoginError";
    this.code = params.code;
    this.remainingAttempts = params.remainingAttempts;
    this.remainingSeconds = params.remainingSeconds;
  }
}

/** POST /api/auth/login with PIN (4–6 digits). */
export async function posLoginWithPin(pin: string): Promise<PosLoginSuccessBody> {
  const res = await posPublicFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ pin }),
  });
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = {};
  }
  const obj = body as PosLoginSuccessBody & {
    message?: string;
    code?: string;
    remainingAttempts?: number;
    remainingSeconds?: number;
  };
  if (!res.ok) {
    const msg = (typeof obj?.message === "string" && obj.message) || res.statusText || `Login failed (${res.status})`;
    const code =
      obj?.code === "DEVICE_PENDING" ||
      obj?.code === "DEVICE_REVOKED" ||
      obj?.code === "INVALID_PIN" ||
      obj?.code === "ACCOUNT_LOCKED"
        ? obj.code
        : null;
    throw new PosLoginError({
      message: sanitizePosApiErrorMessage(msg),
      code,
      remainingAttempts:
        Number.isFinite(obj?.remainingAttempts) && Number(obj.remainingAttempts) >= 0
          ? Number(obj.remainingAttempts)
          : null,
      remainingSeconds:
        Number.isFinite(obj?.remainingSeconds) && Number(obj.remainingSeconds) >= 0
          ? Number(obj.remainingSeconds)
          : null,
    });
  }
  return obj;
}

/** Current user profile + resolved permissions (requires bearer or cookie). */
export async function posFetchCurrentUser() {
  return posApiJson<{
    _id: string;
    name?: string;
    phone?: string;
    role?: string;
    location?: unknown;
    locations?: unknown[];
    organization?: { _id?: string; name?: string; slug?: string } | null;
    permissionRole?: string | null;
    rbacRoleKey?: string;
    permissions?: string[];
  }>("/api/user");
}

/** Log out current POS user and clear local fallback tokens. */
export async function posLogout() {
  try {
    await posApiJson<unknown>("/api/auth/logout", { method: "POST" });
  } finally {
    clearPosDevTokens();
  }
}
