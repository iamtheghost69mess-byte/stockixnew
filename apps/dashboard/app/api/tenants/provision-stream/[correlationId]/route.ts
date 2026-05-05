import { apiFetch } from "@/lib/api-client";

type Params = { params: Promise<{ correlationId: string }> };

export async function GET(_: Request, { params }: Params) {
  const { correlationId } = await params;
  const res = await apiFetch(`/tenants/provision-stream/${correlationId}`);
  return new Response(res.body, {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type") ?? "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
