import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-client";

export async function POST(req: Request) {
  const payload = (await req.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
    mfaCode?: string;
  };

  const res = await apiFetch(
    "/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: payload.email,
        password: payload.password,
        code: payload.mfaCode,
      }),
    },
    req,
  );
  const responseBody = await res.text();
  const out = new NextResponse(responseBody, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) out.headers.set("set-cookie", setCookie);
  return out;
}
