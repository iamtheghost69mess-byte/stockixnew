import { apiFetch } from "@/lib/api-client";
import { NextRequest, NextResponse } from "next/server";

type Params = { params: Promise<{ tenantId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { tenantId } = await params;
  const res = await apiFetch(`/tenants/${tenantId}/repair-finance-link`, { method: "POST" }, req);
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("Content-Type") ?? "application/json" },
  });
}
