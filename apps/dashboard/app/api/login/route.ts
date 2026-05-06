import { NextResponse } from "next/server";
import { z } from "zod";

import { apiFetch } from "@/lib/api-client";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  let input: z.infer<typeof loginSchema>;
  try {
    input = loginSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const forwardedFor = req.headers.get("x-forwarded-for") ?? "";
  const ipAddress = forwardedFor.split(",")[0]?.trim() || "unknown";
  let upstreamResponse: Response;
  try {
    upstreamResponse = await apiFetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: input.email,
        password: input.password,
        ipAddress,
        userAgent: req.headers.get("user-agent"),
      }),
    });
  } catch {
    return NextResponse.json({ error: "auth_upstream_unavailable" }, { status: 503 });
  }

  const data = await upstreamResponse.json().catch(() => ({}));
  const response = NextResponse.json(data, { status: upstreamResponse.status });
  const setCookie = upstreamResponse.headers.get("set-cookie");
  if (setCookie) response.headers.set("set-cookie", setCookie);
  return response;
}
