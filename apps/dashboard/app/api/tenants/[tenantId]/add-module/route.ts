import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-client";

type Params = { params: Promise<{ tenantId: string }> };

export async function POST(req: Request, { params }: Params) {
  const { tenantId } = await params;
  const bodyText = await req.text();
  const res = await apiFetch(
    `/tenants/${tenantId}/add-module`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: bodyText,
    },
    req,
  );
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}
