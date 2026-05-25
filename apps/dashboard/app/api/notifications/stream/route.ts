import { dashboardConfig } from "@repo/config";
import { apiFetch } from "@/lib/api-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const res = await apiFetch(
      "/notifications/stream",
      { signal: req.signal },
      req,
    );

    if (!res.ok || !res.body) {
      return new Response("Stream unavailable", { status: 503 });
    }

    return new Response(res.body, {
      status: 200,
      headers: {
        "content-type": res.headers.get("content-type") ?? "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      },
    });
  } catch {
    const fallback = dashboardConfig.nextPublicApiUrl;
    return new Response(
      `Notification stream unavailable${fallback ? ` (${fallback})` : ""}`,
      { status: 503 },
    );
  }
}
