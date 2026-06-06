import { apiFetch, proxyControlPlaneEventStream } from "@/lib/api-client";
import { isApiConnectionError } from "@/lib/api-connection";

type Params = { params: Promise<{ correlationId: string }> };

/** Long-lived SSE proxy while docker compose pulls images (can take 20+ minutes). */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request, { params }: Params) {
  try {
    const { correlationId } = await params;
    const res = await apiFetch(
      `/tenants/provision-stream/${correlationId}`,
      { signal: req.signal },
      req,
    );
    return proxyControlPlaneEventStream(res, req);
  } catch (error) {
    if (isApiConnectionError(error)) {
      return new Response("Provision stream unavailable", { status: 503 });
    }
    return new Response("Provision stream unavailable", { status: 503 });
  }
}
