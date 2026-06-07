import { apiFetch, proxyControlPlaneEventStream } from "@/lib/api-client";

type Params = { params: Promise<{ correlationId: string }> };

/** Long-lived SSE proxy while docker compose pulls images (can take 20+ minutes). */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const sseGracefulCloseHeaders = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
} as const;

function sseGracefulCloseResponse(): Response {
  return new Response("event: close\ndata: {}\n\n", {
    status: 200,
    headers: sseGracefulCloseHeaders,
  });
}

export async function GET(req: Request, { params }: Params) {
  try {
    const { correlationId } = await params;
    const res = await apiFetch(
      `/tenants/provision-stream/${correlationId}`,
      { signal: req.signal },
      req,
    );
    return proxyControlPlaneEventStream(res, req);
  } catch {
    return sseGracefulCloseResponse();
  }
}
