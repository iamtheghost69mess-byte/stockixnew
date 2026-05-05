import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { MFA_COOKIE, SESSION_COOKIE } from "@/lib/session";

export async function POST() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(MFA_COOKIE);
  return NextResponse.json({ ok: true });
}
