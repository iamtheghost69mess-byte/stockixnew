import { apiFetch, proxyControlPlaneEventStream } from "@/lib/api-client";

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

export async function GET(req: Request) {
  try {
    const res = await apiFetch(
      "/notifications/stream",
      { signal: req.signal },
      req,
    );

    return proxyControlPlaneEventStream(res, req);
  } catch {
    return sseGracefulCloseResponse();
  }
}
