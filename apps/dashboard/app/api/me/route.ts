import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { SESSION_COOKIE, verifySession } from "@/lib/session";

export async function GET() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value ?? "";
  const session = token ? await verifySession(token) : null;
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    id: session.sub,
    role: session.role,
    email: session.email,
    name: session.name,
  });
}
