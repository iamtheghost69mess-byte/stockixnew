import { apiFetch } from "@/lib/api-client";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const res = await apiFetch(`/licenses/export.csv${url.search}`, {}, req);
  const body = await res.arrayBuffer();
  return new Response(body, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("content-type") ?? "text/csv; charset=utf-8",
      "Content-Disposition":
        res.headers.get("content-disposition") ?? 'attachment; filename="licenses.csv"',
    },
  });
}
