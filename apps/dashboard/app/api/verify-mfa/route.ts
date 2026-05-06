import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { MFA_COOKIE } from "@/lib/session";
import { apiFetch } from "@/lib/api-client";

const schema = z.object({ code: z.string().min(6).max(8) });

export async function POST(req: Request) {
  const jar = await cookies();
  const pendingToken = jar.get(MFA_COOKIE)?.value;
  if (!pendingToken) return NextResponse.json({ error: "MFA token missing" }, { status: 401 });

  let input: z.infer<typeof schema>;
  try {
    input = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  let res: Response;
  try {
    res = await apiFetch("/auth/verify-mfa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mfaToken: pendingToken, code: input.code }),
    });
  } catch {
    return NextResponse.json({ error: "auth_upstream_unavailable" }, { status: 503 });
  }
  const data = await res.json().catch(() => ({}));
  const response = NextResponse.json(data, { status: res.status });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) response.headers.set("set-cookie", setCookie);
  if (res.ok) jar.delete(MFA_COOKIE);
  return response;
}
