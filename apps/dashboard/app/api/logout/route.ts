import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { MFA_COOKIE, SESSION_COOKIE } from "@/lib/session";

export async function POST() {
  const jar = await cookies();
  // Note: this is cookie-side logout only. If a token is stolen before logout,
  // it remains valid until expiry/session-version invalidation. Server-side
  // token revocation/blacklisting is planned as a future hardening phase.
  jar.delete(SESSION_COOKIE);
  jar.delete(MFA_COOKIE);
  return NextResponse.json({ ok: true });
}
