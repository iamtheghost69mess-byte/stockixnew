import { apiFetch } from "@/lib/api-client";

type Params = { params: Promise<{ correlationId: string }> };

/** Long-lived SSE proxy while docker compose pulls images (can take 20+ minutes). */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request, { params }: Params) {
  const { correlationId } = await params;
  const res = await apiFetch(`/tenants/provision-stream/${correlationId}`, {}, req);
  return new Response(res.body, {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type") ?? "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
