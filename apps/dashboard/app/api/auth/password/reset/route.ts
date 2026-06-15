import { NextResponse } from "next/server";

import { apiFetch } from "@/lib/api-client";

export async function POST(req: Request) {
  const payload = (await req.json().catch(() => ({}))) as {
    token?: string;
    password?: string;
  };

  const res = await apiFetch(
    "/auth/password/reset",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: payload.token,
        password: payload.password,
      }),
    },
    req,
  );

  const responseBody = await res.text();
  return new NextResponse(responseBody, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}
