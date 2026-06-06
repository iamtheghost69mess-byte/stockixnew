import { dashboardConfig } from "@repo/config";
import { apiFetch, proxyControlPlaneEventStream } from "@/lib/api-client";
import { isApiConnectionError } from "@/lib/api-connection";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const res = await apiFetch(
      "/notifications/stream",
      { signal: req.signal },
      req,
    );

    return proxyControlPlaneEventStream(res, req);
  } catch (error) {
    if (isApiConnectionError(error)) {
      return new Response("Notification stream unavailable", { status: 503 });
    }
    const fallback = dashboardConfig.nextPublicApiUrl;
    return new Response(
      `Notification stream unavailable${fallback ? ` (${fallback})` : ""}`,
      { status: 503 },
    );
  }
}
