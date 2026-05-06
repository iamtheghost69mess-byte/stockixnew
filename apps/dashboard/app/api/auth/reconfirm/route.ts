import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiFetch } from "@/lib/api-client";
import { SESSION_COOKIE } from "@/lib/session";

const schema = z.object({ password: z.string().min(1) });

export async function POST(req: Request) {
  const sessionToken = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
  let input: z.infer<typeof schema>;
  try {
    input = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const res = await apiFetch("/auth/reconfirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, sessionToken }),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "auth_upstream_unavailable" }, { status: 503 });
  }
}
