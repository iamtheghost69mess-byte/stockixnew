import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-client";

export async function POST(req: Request) {
  const payload = (await req.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
    mfaCode?: string;
  };

  let res: Response;
  try {
    res = await apiFetch(
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
  } catch (err) {
    const code =
      err instanceof Error && "code" in err
        ? String((err as NodeJS.ErrnoException).code)
        : "";
    const refused = code === "ECONNREFUSED" || code === "ENOTFOUND";
    if (refused) {
      return NextResponse.json(
        {
          error:
            "Control-plane API is not reachable. From the repo root run `pnpm dev` (or start the API on port 4000).",
        },
        { status: 503 },
      );
    }
    throw err;
  }
  const responseBody = await res.text();
  const out = new NextResponse(responseBody, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
  const getSetCookie = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const setCookies = typeof getSetCookie === "function" ? getSetCookie.call(res.headers) : [];
  if (setCookies.length > 0) {
    for (const cookie of setCookies) out.headers.append("set-cookie", cookie);
  } else {
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) out.headers.set("set-cookie", setCookie);
  }
  return out;
}
